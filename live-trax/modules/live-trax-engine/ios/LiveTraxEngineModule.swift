import ExpoModulesCore

public class LiveTraxEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveTraxEngine")

    // Plumbing test — confirms the native module is linked and callable.
    Function("hello") { () -> String in
      return "LiveTraxEngine native OK"
    }

    Function("add") { (a: Double, b: Double) -> Double in
      return a + b
    }
  }
}
