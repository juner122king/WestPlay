//! Conservative lane advice from the prefab's directed navigation graph, never from turn heuristics.
use crate::prefab::Prefab;

/// One physical inbound lane, ordered left to right in the driver's direction.
#[derive(Clone, Debug, PartialEq)]
pub struct Lane {
    pub directions: Vec<&'static str>,
    pub recommended: bool,
}

/// A lane decision at `node`, applicable only on the verified approach `[start, end)`.
#[derive(Clone, Debug, PartialEq)]
pub struct LaneHint {
    pub node: usize,
    pub start: usize,
    pub end: usize,
    pub lanes: Vec<Lane>,
}

/// Trace backwards only through verified, equal-count road spans. A prefab/unknown span is a boundary.
pub(crate) fn approach_start(node: usize, count: usize, mut lanes_on: impl FnMut(usize) -> Option<usize>) -> usize {
    let mut start = node;
    while start > 0 && lanes_on(start - 1) == Some(count) {
        start -= 1;
    }
    start
}

/// All inbound lanes and the truck-permitted exits each can reach. Ambiguous or broken graphs give no advice.
pub fn lanes_at(prefab: &Prefab, from: usize, to: usize) -> Option<Vec<Lane>> {
    let entrance = prefab.nodes.get(from)?;
    prefab.nodes.get(to)?;
    if from == to || prefab.has_ring() || entrance.curves_in.is_empty() {
        return None;
    }
    let way = entrance.direction;
    if !way.iter().all(|v| v.is_finite()) || way[0].hypot(way[1]) < 0.5 {
        return None;
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    for &index in &entrance.curves_in {
        let curve = prefab.curves.get(index)?;
        if !curve.start.iter().all(|v| v.is_finite()) {
            return None;
        }
        if let Some(group) = groups.iter_mut().find(|group| {
            let start = prefab.curves[group[0]].start;
            (start[0] - curve.start[0]).hypot(start[1] - curve.start[1]) < 1.0
        }) {
            group.push(index);
        } else {
            groups.push(vec![index]);
        }
    }
    if !(2..=8).contains(&groups.len()) {
        return None;
    }
    let across = |index: usize| {
        let p = prefab.curves[index].start;
        (p[0] - entrance.position[0]) * -way[1] + (p[1] - entrance.position[1]) * way[0]
    };
    groups.sort_by(|a, b| across(a[0]).total_cmp(&across(b[0])));
    // Overlapping lane centres and unusually large gaps aren't a confidently readable carriageway.
    if groups.windows(2).any(|pair| !(2.0..=6.0).contains(&(across(pair[1][0]) - across(pair[0][0])))) {
        return None;
    }
    let mut lanes = Vec::new();
    for starts in groups {
        let mut reached = vec![false; prefab.curves.len()];
        let mut pending = starts;
        let mut exits = Vec::new();
        while let Some(index) = pending.pop() {
            let curve = prefab.curves.get(index)?;
            if reached[index] || !curve.trucks {
                continue;
            }
            reached[index] = true;
            let mut terminal = false;
            for (end, node) in prefab.nodes.iter().enumerate() {
                if node.curves_out.contains(&index) {
                    if end != from && !exits.contains(&end) {
                        exits.push(end);
                    }
                    terminal = true;
                }
            }
            if !terminal {
                if curve.next.is_empty() {
                    return None;
                }
                pending.extend(&curve.next);
            }
        }
        let mut directions = Vec::new();
        for &exit in &exits {
            let out = prefab.nodes[exit].direction.map(|v| -v);
            if !out.iter().all(|v| v.is_finite()) || out[0].hypot(out[1]) < 0.5 {
                return None;
            }
            let angle = (way[0] * out[1] - way[1] * out[0]).atan2(way[0] * out[0] + way[1] * out[1]).to_degrees();
            let direction = match angle.abs() {
                a if a < 20.0 => "straight",
                a if a >= 165.0 => "u-turn",
                a if a < 45.0 && angle < 0.0 => "slight-left",
                a if a < 45.0 => "slight-right",
                _ if angle < 0.0 => "left",
                _ => "right",
            };
            if !directions.contains(&direction) {
                directions.push(direction);
            }
        }
        // A car-only lane may be shown unavailable, but must never be recommended.
        directions.sort_unstable();
        lanes.push(Lane { directions, recommended: exits.contains(&to) });
    }
    let recommended = lanes.iter().filter(|lane| lane.recommended).count();
    (recommended > 0 && recommended < lanes.len()).then_some(lanes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prefab::{NavCurve, PrefabNode};

    fn node(direction: [f32; 2], curves_in: Vec<usize>, curves_out: Vec<usize>) -> PrefabNode {
        PrefabNode {
            position: [0.0, 0.0],
            height: 0.0,
            direction,
            rise: 0.0,
            lanes: 2,
            curves_in,
            curves_out,
            terrain_points: Vec::new(),
        }
    }
    fn curve(x: f32) -> NavCurve {
        NavCurve {
            start: [x, 0.0],
            end: [x, -20.0],
            heights: [0.0; 2],
            start_direction: [0.0, -1.0],
            end_direction: [0.0, -1.0],
            rotations: [[1.0, 0.0, 0.0, 0.0]; 2],
            length: 20.0,
            next: Vec::new(),
            trucks: true,
        }
    }
    fn fork() -> Prefab {
        Prefab {
            nodes: vec![
                node([0.0, -1.0], vec![2, 0, 1], vec![]),
                node([0.0, 1.0], vec![], vec![0, 1]),
                node([-1.0, 0.0], vec![], vec![2]),
            ],
            curves: vec![curve(-4.5), curve(0.0), curve(4.5)],
            map_points: Vec::new(),
            spawn_points: Vec::new(),
            triggers: Vec::new(),
        }
    }
    #[test]
    fn approach_stops_at_count_changes_prefabs_and_unknown_roads() {
        let spans = [Some(3), Some(3), None, Some(3), Some(3)];
        assert_eq!(approach_start(5, 3, |i| spans[i]), 3);
        assert_eq!(approach_start(2, 3, |i| spans[i]), 0);
        assert_eq!(approach_start(2, 2, |i| spans[i]), 2);
        assert_eq!(approach_start(0, 3, |_| panic!("no span before start")), 0);
    }

    #[test]
    fn rejects_a_car_only_link_in_the_middle_of_a_truck_path() {
        let mut prefab = fork();
        prefab.curves.push(curve(4.5));
        prefab.nodes[2].curves_out = vec![3];
        prefab.curves[2].next = vec![3];
        assert!(lanes_at(&prefab, 0, 2).unwrap()[2].recommended);
        prefab.curves[3].trucks = false;
        assert!(lanes_at(&prefab, 0, 2).is_none());
    }

    #[test]
    fn recommends_all_reachable_lanes_in_driver_order() {
        let prefab = fork();
        let lanes = lanes_at(&prefab, 0, 1).unwrap();
        assert_eq!(lanes.iter().map(|lane| lane.recommended).collect::<Vec<_>>(), [true, true, false]);
        assert_eq!(lanes[0].directions, ["straight"]);
        assert_eq!(lanes[2].directions, ["right"]);
        assert_eq!(
            lanes_at(&prefab, 0, 2).unwrap().iter().map(|l| l.recommended).collect::<Vec<_>>(),
            [false, false, true]
        );
    }
    #[test]
    fn a_shared_entry_is_one_lane_with_combined_arrows() {
        let mut prefab = fork();
        prefab.curves.push(curve(-4.5));
        prefab.nodes[0].curves_in.push(3);
        prefab.nodes[2].curves_out.push(3);
        let lanes = lanes_at(&prefab, 0, 2).unwrap();
        assert_eq!(lanes.len(), 3);
        assert_eq!(lanes[0].directions, ["right", "straight"]);
        assert!(lanes[0].recommended && lanes[2].recommended);
    }
    #[test]
    fn does_not_fall_back_to_car_only_paths() {
        let mut prefab = fork();
        prefab.curves[2].trucks = false;
        assert!(lanes_at(&prefab, 0, 2).is_none());
        assert!(!lanes_at(&prefab, 0, 1).unwrap()[2].recommended);
    }
    #[test]
    fn broken_or_cyclic_graphs_do_not_invent_advice() {
        let mut prefab = fork();
        prefab.nodes[2].curves_out.clear();
        prefab.curves[2].next = vec![999];
        assert!(lanes_at(&prefab, 0, 2).is_none());
        prefab.curves[2].next = vec![2];
        assert!(lanes_at(&prefab, 0, 2).is_none());
    }
    #[test]
    fn mirrored_geometry_keeps_driver_left_to_right_order() {
        let mut prefab = fork();
        for curve in &mut prefab.curves {
            curve.start = curve.start.map(|v| -v);
        }
        for node in &mut prefab.nodes {
            node.direction = node.direction.map(|v| -v);
        }
        let lanes = lanes_at(&prefab, 0, 2).unwrap();
        assert_eq!(lanes.iter().map(|l| l.recommended).collect::<Vec<_>>(), [false, false, true]);
    }
    #[test]
    fn trivial_or_unreadable_approaches_are_hidden() {
        let mut prefab = fork();
        prefab.nodes[0].curves_in = vec![0];
        assert!(lanes_at(&prefab, 0, 1).is_none());
        let mut prefab = fork();
        prefab.nodes[1].curves_out.push(2);
        assert!(lanes_at(&prefab, 0, 1).is_none());
        let mut prefab = fork();
        prefab.curves[2].start[0] = 40.0;
        assert!(lanes_at(&prefab, 0, 1).is_none());
    }
}
