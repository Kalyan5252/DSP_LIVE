#include "PadEngineJSI.h"

#include "PadEngine.h"

#include <memory>
#include <string>

using namespace facebook;

namespace livetrax {

namespace {

// A JSI host object that wraps one PadEngine instance and exposes its methods
// to JavaScript. The engine lives for the life of the runtime.
class PadEngineHostObject : public jsi::HostObject {
public:
  PadEngineHostObject() {
    engine_ = std::make_unique<PadEngine>();
    engine_->init();
  }

  ~PadEngineHostObject() override {
    if (engine_) engine_->shutdown();
  }

  // Return a JS function for each known property name.
  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    const std::string prop = name.utf8(rt);

    // loadPad(index, filePath, loop) -> bool
    if (prop == "loadPad") {
      return jsi::Function::createFromHostFunction(
          rt, name, 3,
          [this](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count < 3) return jsi::Value(false);
            int index = static_cast<int>(args[0].asNumber());
            std::string path = args[1].asString(rt).utf8(rt);
            bool loop = args[2].asBool();
            return jsi::Value(engine_->loadPad(index, path, loop));
          });
    }

    // clearPad(index)
    if (prop == "clearPad") {
      return jsi::Function::createFromHostFunction(
          rt, name, 1,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count >= 1) engine_->clearPad(static_cast<int>(args[0].asNumber()));
            return jsi::Value::undefined();
          });
    }

    // trigger(index)
    if (prop == "trigger") {
      return jsi::Function::createFromHostFunction(
          rt, name, 1,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count >= 1) engine_->trigger(static_cast<int>(args[0].asNumber()));
            return jsi::Value::undefined();
          });
    }

    // stop(index)
    if (prop == "stop") {
      return jsi::Function::createFromHostFunction(
          rt, name, 1,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count >= 1) engine_->stop(static_cast<int>(args[0].asNumber()));
            return jsi::Value::undefined();
          });
    }

    // setLoop(index, loop)
    if (prop == "setLoop") {
      return jsi::Function::createFromHostFunction(
          rt, name, 2,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count >= 2)
              engine_->setLoop(static_cast<int>(args[0].asNumber()), args[1].asBool());
            return jsi::Value::undefined();
          });
    }

    // stopAll()
    if (prop == "stopAll") {
      return jsi::Function::createFromHostFunction(
          rt, name, 0,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value*,
                 size_t) -> jsi::Value {
            engine_->stopAll();
            return jsi::Value::undefined();
          });
    }

    // isPlaying(index) -> bool
    if (prop == "isPlaying") {
      return jsi::Function::createFromHostFunction(
          rt, name, 1,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count < 1) return jsi::Value(false);
            return jsi::Value(engine_->isPlaying(static_cast<int>(args[0].asNumber())));
          });
    }

    // isLoaded(index) -> bool
    if (prop == "isLoaded") {
      return jsi::Function::createFromHostFunction(
          rt, name, 1,
          [this](jsi::Runtime&, const jsi::Value&, const jsi::Value* args,
                 size_t count) -> jsi::Value {
            if (count < 1) return jsi::Value(false);
            return jsi::Value(engine_->isLoaded(static_cast<int>(args[0].asNumber())));
          });
    }

    return jsi::Value::undefined();
  }

  std::vector<jsi::PropNameID> getPropertyNames(jsi::Runtime& rt) override {
    std::vector<jsi::PropNameID> names;
    for (const char* n : {"loadPad", "clearPad", "trigger", "stop", "setLoop",
                          "stopAll", "isPlaying", "isLoaded"}) {
      names.push_back(jsi::PropNameID::forUtf8(rt, n));
    }
    return names;
  }

private:
  std::unique_ptr<PadEngine> engine_;
};

} // namespace

void installPadEngine(jsi::Runtime& runtime) {
  auto hostObject = std::make_shared<PadEngineHostObject>();
  auto object = jsi::Object::createFromHostObject(runtime, hostObject);
  runtime.global().setProperty(runtime, "__LiveTrax", std::move(object));
}

} // namespace livetrax
