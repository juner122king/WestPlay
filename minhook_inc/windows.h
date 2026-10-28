
#ifndef MIN_WIN_H
#define MIN_WIN_H

#include <stdint.h>
#include <stddef.h>

#define WINAPI __attribute__((ms_abi))
#define VOID void
typedef void *PVOID, *LPVOID;
typedef const void *LPCVOID;
typedef int BOOL;
#define TRUE 1
#define FALSE 0
typedef uint8_t BYTE, *LPBYTE;
typedef uint16_t WORD, *LPWORD;
typedef uint32_t DWORD, *LPDWORD;
typedef uintptr_t DWORD_PTR, ULONG_PTR, SIZE_T;
typedef int32_t LONG, *LPLONG;
typedef uint32_t ULONG, UINT, *PUINT, *PUINT32;
typedef int8_t INT8;
typedef int16_t INT16;
typedef int32_t INT32;
typedef int64_t INT64;
typedef uint8_t UINT8;
typedef uint16_t UINT16;
typedef uint32_t UINT32;
typedef uint64_t UINT64, DWORD64;
typedef const char *LPCSTR;
typedef const wchar_t *LPCWSTR;
typedef void *HANDLE;
typedef void *HMODULE;

#define NULL ((void*)0)
#define UINT_MAX 0xffffffffU
#define UCHAR_MAX 255

#define PAGE_NOACCESS          0x01
#define PAGE_READONLY          0x02
#define PAGE_READWRITE         0x04
#define PAGE_WRITECOPY         0x08
#define PAGE_EXECUTE           0x10
#define PAGE_EXECUTE_READ      0x20
#define PAGE_EXECUTE_READWRITE 0x40
#define PAGE_EXECUTE_WRITECOPY 0x80
#define PAGE_GUARD            0x100
#define PAGE_NOCACHE          0x200
#define PAGE_WRITECOMBINE     0x400

#define MEM_COMMIT           0x1000
#define MEM_RESERVE          0x2000
#define MEM_DECOMMIT         0x4000
#define MEM_RELEASE          0x8000
#define MEM_FREE            0x10000
#define MEM_PRIVATE         0x20000
#define MEM_MAPPED          0x40000
#define MEM_RESET           0x80000

typedef struct _MEMORY_BASIC_INFORMATION {
    PVOID BaseAddress;
    PVOID AllocationBase;
    DWORD AllocationProtect;
    SIZE_T RegionSize;
    DWORD State;
    DWORD Protect;
    DWORD Type;
} MEMORY_BASIC_INFORMATION, *PMEMORY_BASIC_INFORMATION;

typedef struct _SYSTEM_INFO {
    union {
        DWORD dwOemId;
        struct {
            WORD wProcessorArchitecture;
            WORD wReserved;
        };
    };
    DWORD dwPageSize;
    LPVOID lpMinimumApplicationAddress;
    LPVOID lpMaximumApplicationAddress;
    DWORD_PTR dwActiveProcessorMask;
    DWORD dwNumberOfProcessors;
    DWORD dwProcessorType;
    DWORD dwAllocationGranularity;
    WORD wProcessorLevel;
    WORD wProcessorRevision;
} SYSTEM_INFO, *LPSYSTEM_INFO;

#define TH32CS_SNAPTHREAD 0x00000004
#define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)
#define THREAD_SUSPEND_RESUME 0x0002
#define THREAD_GET_CONTEXT    0x0008
#define THREAD_SET_CONTEXT    0x0010
#define THREAD_QUERY_INFORMATION 0x0040
#define CONTEXT_CONTROL       0x00100001L
#define ERROR_NO_MORE_FILES   18L

#define FIELD_OFFSET(type, field) ((LONG)(intptr_t)&(((type *)0)->field))

WINAPI DWORD GetLastError(VOID);
WINAPI VOID Sleep(DWORD dwMilliseconds);
WINAPI HANDLE HeapCreate(DWORD flOptions, SIZE_T dwInitialSize, SIZE_T dwMaximumSize);
WINAPI BOOL HeapDestroy(HANDLE hHeap);
#define InterlockedCompareExchange(Destination, Exchange, Comperand) __sync_val_compare_and_swap(Destination, Comperand, Exchange)
#define InterlockedExchange(Target, Value) __sync_lock_test_and_set(Target, Value)


typedef struct tagTHREADENTRY32 {
    DWORD dwSize;
    DWORD cntUsage;
    DWORD th32ThreadID;
    DWORD th32OwnerProcessID;
    LONG tpBasePri;
    LONG tpDeltaPri;
    DWORD dwFlags;
} THREADENTRY32, *PTHREADENTRY32, *LPTHREADENTRY32;

typedef struct _CRITICAL_SECTION {
    void *DebugInfo;
    LONG LockCount;
    LONG RecursionCount;
    HANDLE OwningThread;
    HANDLE LockSemaphore;
    ULONG_PTR SpinCount;
} CRITICAL_SECTION, *PCRITICAL_SECTION, *LPCRITICAL_SECTION;

typedef struct _M128A {
    uint64_t Low;
    int64_t High;
} M128A;

typedef struct _XSAVE_FORMAT64 {
    WORD ControlWord;
    WORD StatusWord;
    BYTE TagWord;
    BYTE Reserved1;
    WORD ErrorOpcode;
    DWORD ErrorOffset;
    WORD ErrorSelector;
    WORD Reserved2;
    DWORD DataOffset;
    WORD DataSelector;
    WORD Reserved3;
    DWORD MxCsr;
    DWORD MxCsr_Mask;
    M128A FloatRegisters[8];
    M128A XmmRegisters[16];
    BYTE Reserved4[96];
} XSAVE_FORMAT64;

typedef struct _CONTEXT {
    DWORD64 P1Home;
    DWORD64 P2Home;
    DWORD64 P3Home;
    DWORD64 P4Home;
    DWORD64 P5Home;
    DWORD64 P6Home;
    DWORD ContextFlags;
    DWORD MxCsr;
    WORD SegCs;
    WORD SegDs;
    WORD SegEs;
    WORD SegFs;
    WORD SegGs;
    WORD SegSs;
    DWORD EFlags;
    DWORD64 Dr0;
    DWORD64 Dr1;
    DWORD64 Dr2;
    DWORD64 Dr3;
    DWORD64 Dr6;
    DWORD64 Dr7;
    DWORD64 Rax;
    DWORD64 Rcx;
    DWORD64 Rdx;
    DWORD64 Rbx;
    DWORD64 Rsp;
    DWORD64 Rbp;
    DWORD64 Rsi;
    DWORD64 Rdi;
    DWORD64 R8;
    DWORD64 R9;
    DWORD64 R10;
    DWORD64 R11;
    DWORD64 R12;
    DWORD64 R13;
    DWORD64 R14;
    DWORD64 R15;
    DWORD64 Rip;
    XSAVE_FORMAT64 FltSave;
    M128A Header[2];
    M128A Legacy[8];
    M128A Xmm0;
    M128A Xmm1;
    M128A Xmm2;
    M128A Xmm3;
    M128A Xmm4;
    M128A Xmm5;
    M128A Xmm6;
    M128A Xmm7;
    M128A Xmm8;
    M128A Xmm9;
    M128A Xmm10;
    M128A Xmm11;
    M128A Xmm12;
    M128A Xmm13;
    M128A Xmm14;
    M128A Xmm15;
    M128A VectorRegister[26];
    DWORD64 VectorControl;
    DWORD64 DebugControl;
    DWORD64 LastBranchToRip;
    DWORD64 LastBranchFromRip;
    DWORD64 LastExceptionToRip;
    DWORD64 LastExceptionFromRip;
} CONTEXT, *PCONTEXT, *LPCONTEXT;

WINAPI LPVOID VirtualAlloc(LPVOID lpAddress, SIZE_T dwSize, DWORD flAllocationType, DWORD flProtect);
WINAPI BOOL VirtualFree(LPVOID lpAddress, SIZE_T dwSize, DWORD dwFreeType);
WINAPI SIZE_T VirtualQuery(LPCVOID lpAddress, PMEMORY_BASIC_INFORMATION lpBuffer, SIZE_T dwLength);
WINAPI BOOL VirtualProtect(LPVOID lpAddress, SIZE_T dwSize, DWORD flNewProtect, DWORD *lpflOldProtect);
WINAPI VOID GetSystemInfo(LPSYSTEM_INFO lpSystemInfo);
WINAPI HANDLE GetCurrentProcess(VOID);
WINAPI DWORD GetCurrentProcessId(VOID);
WINAPI DWORD GetCurrentThreadId(VOID);
WINAPI HANDLE CreateToolhelp32Snapshot(DWORD dwFlags, DWORD th32ProcessID);
WINAPI BOOL Thread32First(HANDLE hSnapshot, LPTHREADENTRY32 lpte);
WINAPI BOOL Thread32Next(HANDLE hSnapshot, LPTHREADENTRY32 lpte);
WINAPI HANDLE OpenThread(DWORD dwDesiredAccess, BOOL bInheritHandle, DWORD dwThreadId);
WINAPI DWORD SuspendThread(HANDLE hThread);
WINAPI DWORD ResumeThread(HANDLE hThread);
WINAPI BOOL CloseHandle(HANDLE hObject);
WINAPI BOOL FlushInstructionCache(HANDLE hProcess, LPCVOID lpBaseAddress, SIZE_T dwSize);
WINAPI BOOL GetThreadContext(HANDLE hThread, LPCONTEXT lpContext);
WINAPI BOOL SetThreadContext(HANDLE hThread, const CONTEXT *lpContext);
WINAPI HANDLE GetProcessHeap(VOID);
WINAPI LPVOID HeapAlloc(HANDLE hHeap, DWORD dwFlags, SIZE_T dwBytes);
WINAPI LPVOID HeapReAlloc(HANDLE hHeap, DWORD dwFlags, LPVOID lpMem, SIZE_T dwBytes);
WINAPI BOOL HeapFree(HANDLE hHeap, DWORD dwFlags, LPVOID lpMem);
WINAPI VOID InitializeCriticalSection(LPCRITICAL_SECTION lpCriticalSection);
WINAPI VOID DeleteCriticalSection(LPCRITICAL_SECTION lpCriticalSection);
WINAPI VOID EnterCriticalSection(LPCRITICAL_SECTION lpCriticalSection);
WINAPI VOID LeaveCriticalSection(LPCRITICAL_SECTION lpCriticalSection);
WINAPI HMODULE GetModuleHandleW(LPCWSTR lpModuleName);
typedef intptr_t (*FARPROC)(void);
WINAPI FARPROC GetProcAddress(HMODULE hModule, LPCSTR lpProcName);

void *memcpy(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);

#endif
