import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.util.*;

public class BridgeProof {
  public static void main(String[] args) throws Exception {
    var connector = Bootstrap.virtualMachineManager().attachingConnectors().stream()
      .filter(c -> c.name().equals("com.sun.jdi.SocketAttach")).findFirst().orElseThrow();
    var options = connector.defaultArguments();
    options.get("hostname").setValue("127.0.0.1");
    options.get("port").setValue(args[0]);
    options.get("timeout").setValue("10000");
    VirtualMachine vm = connector.attach(options);
    try {
      var fixture = vm.classesByName("com.agenteasyuse.mobileeasyuse.apidemo.state.DebuggerBridgeFixture").get(0);
      var bp = vm.eventRequestManager().createBreakpointRequest(fixture.methodsByName("checkpoint", "()V").get(0).location());
      bp.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
      bp.enable();
      System.out.println("BREAKPOINT_READY");
      long deadline = System.currentTimeMillis() + 30000;
      while (System.currentTimeMillis() < deadline) {
        EventSet events = vm.eventQueue().remove(1000);
        if (events == null) continue;
        try {
          for (Event event : events) {
            if (!(event instanceof BreakpointEvent hit)) continue;
            bp.disable();
            var thread = hit.thread();
            var target = thread.frame(0).thisObject();
            System.out.println("BREAKPOINT_HIT thread=" + thread.name() + " targetID=" + target.uniqueID());
            var bridge = (ClassType)vm.classesByName("com.agenteasyuse.mobileeasyuse.apidemo.state.AgentBridge").get(0);
            var inspect = bridge.methodsByName("inspect", "(Ljava/lang/Object;Ljava/lang/String;)Ljava/lang/String;").get(0);
            for (String expression : List.of("session.config.version", "session.getConfig().getVersion()")) {
              long start = System.nanoTime();
              var result = (StringReference)bridge.invokeMethod(thread, inspect,
                List.of(target, vm.mirrorOf(expression)), ObjectReference.INVOKE_SINGLE_THREADED);
              String json = result.value();
              System.out.println("RESULT " + json);
              System.out.printf(Locale.ROOT,"INVOKE_MS %.3f%n", (System.nanoTime()-start)/1e6);
              if (!json.contains("\"handledBy\":\"frida\"") || !json.contains("\"value\":\"bridge-proof-20260920\""))
                throw new AssertionError("Unexpected result: " + json);
            }
            System.out.println("PROOF_PASSED");
            return;
          }
        } finally { events.resume(); }
      }
      throw new IllegalStateException("No breakpoint hit within 30s");
    } finally { vm.dispose(); }
  }
}
