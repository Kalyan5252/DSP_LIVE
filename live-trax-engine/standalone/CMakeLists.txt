cmake_minimum_required(VERSION 3.16)
project(live-trax_engine_test LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(padtest
  test_main.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../engine/PadEngine.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../engine/miniaudio_impl.cpp
)

target_include_directories(padtest PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../engine
)

# miniaudio needs the platform's native audio libraries.
if(APPLE)
  target_link_libraries(padtest
    "-framework CoreFoundation"
    "-framework CoreAudio"
    "-framework AudioToolbox"
    "-framework AudioUnit"
  )
elseif(UNIX)
  find_package(Threads REQUIRED)
  target_link_libraries(padtest Threads::Threads ${CMAKE_DL_LIBS} m)
elseif(WIN32)
  # miniaudio uses WASAPI/DirectSound via ole32 etc.; usually linked automatically.
endif()
