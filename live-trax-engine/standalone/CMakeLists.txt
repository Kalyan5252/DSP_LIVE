cmake_minimum_required(VERSION 3.16)
project(live_trax_engine LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ENGINE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../engine)
set(TP ${CMAKE_CURRENT_SOURCE_DIR}/../third_party)

# --- padtest: the pad-trigger engine harness ---
add_executable(padtest
  test_main.cpp
  ${ENGINE_DIR}/PadEngine.cpp
  ${ENGINE_DIR}/miniaudio_impl.cpp
)
target_include_directories(padtest PRIVATE ${ENGINE_DIR})
set(ALL_TARGETS padtest)

# --- stretch_demo: Phase 0 time-stretch proof (needs Signalsmith) ---
if(EXISTS ${TP}/signalsmith-stretch/include/signalsmith-stretch/signalsmith-stretch.h)
  add_executable(stretch_demo
    stretch_demo.cpp
    ${ENGINE_DIR}/miniaudio_impl.cpp
  )
  target_include_directories(stretch_demo PRIVATE
    ${ENGINE_DIR}
    ${TP}/signalsmith-stretch/include
    ${TP}
  )
  list(APPEND ALL_TARGETS stretch_demo)
else()
  message(STATUS "Signalsmith not found in third_party/ - run fetch_deps.sh to enable stretch_demo")
endif()

# --- platform audio libraries ---
foreach(T ${ALL_TARGETS})
  if(APPLE)
    target_link_libraries(${T} "-framework CoreFoundation" "-framework CoreAudio"
      "-framework AudioToolbox" "-framework AudioUnit")
  elseif(UNIX)
    find_package(Threads REQUIRED)
    target_link_libraries(${T} Threads::Threads ${CMAKE_DL_LIBS} m)
  endif()
endforeach()
