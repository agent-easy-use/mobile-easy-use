import Foundation

@inline(never)
private func debuggerTouch(_ value: inout Int) {}

@objc(APIDebuggerSwiftFixture)
@objcMembers
public final class APIDebuggerSwiftFixture: NSObject {
    public dynamic var field = 5
    public dynamic var tail = 0
    public dynamic var result = 0

    @inline(never)
    public dynamic func calculate(_ input: Int) -> Int {
        var price = input
        let label = "hello 世界"
        let object = NSNumber(value: 42)
        let empty: Int? = nil
        debuggerTouch(&price) // BP_SWIFT_VALUE
        tail += 1
        result = price + field
        withExtendedLifetime((label, object, empty)) {}
        return result
    }

    @inline(never)
    public dynamic func performVoid() {
        tail += 1 // BP_SWIFT_VOID
    }
}
