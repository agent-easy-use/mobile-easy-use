import Foundation

protocol DebuggerShape {}
struct DebuggerPoint: DebuggerShape { var x: Int }
enum DebuggerMode { case first, second }
final class DebuggerModel {}

#if MEU_OBJC_FIXTURE
@_silgen_name("debuggerObjC")
func debuggerObjC()
#endif

@inline(never)
func debuggerMarker(_ price: inout Int) {}

@inline(never)
func debuggerPrice(_ input: Int) -> Int {
    var price = input
    var label = "hi\0世界😀"
    let erased: Any = "from Any"
    var point = DebuggerPoint(x: 7)
    var model = DebuggerModel()
    var object = NSMutableArray(array: ["item"])
    let wide = Int64.max - 1
    var mode = DebuggerMode.first
    let shape: any DebuggerShape = point
    let optional: Int? = 1
    var pointer = UnsafeRawPointer(bitPattern: 0x1234)!
    debuggerMarker(&price) // BREAKPOINT: addressable local, not a compiler debug-only copy
    price += 1
    withExtendedLifetime((label, erased, point, model, object, wide, mode, shape, optional, pointer)) {}
    return price + 10
}

@inline(never)
func debuggerDouble(_ input: Double) -> Double {
    return input + 1 // DOUBLE_BREAKPOINT
}

@inline(never)
func debuggerBool(_ input: Bool) -> Bool {
    return !input // BOOL_BREAKPOINT
}

@inline(never)
func debuggerWide(_ input: Int64) -> Int64 {
    return input + 1 // WIDE_BREAKPOINT
}

if let gate = getenv("MEU_DEBUGGER_GATE") {
    while access(gate, F_OK) != 0 { usleep(10000) }
}
let first = debuggerPrice(100)
let second = debuggerPrice(200)
@_cdecl("debuggerSwiftFirst")
public func debuggerSwiftFirst() -> Int32 { Int32(first) }
@_cdecl("debuggerSwiftSecond")
public func debuggerSwiftSecond() -> Int32 { Int32(second) }
#if MEU_OBJC_FIXTURE
debuggerObjC()
debuggerObjC()
#endif
let floating = debuggerDouble(1.25)
let boolean = debuggerBool(false)
let wide = debuggerWide(123)
print(first)
print(second)
if getenv("MEU_DEBUGGER_CHECK") != nil {
    assert(first == 200 && second == 211)
}
if getenv("MEU_DEBUGGER_CHECK_SCALARS") != nil {
    assert(floating == 3.5 && boolean == false && wide == Int64.max)
}
// Debugger interrupts can shorten sleep; keep the live fixture available until
// its harness has removed breakpoints and detached both clients.
if getenv("MEU_DEBUGGER_HOST_TEST") != nil {
    while true { sleep(1) }
}
