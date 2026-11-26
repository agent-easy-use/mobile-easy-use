cmake_minimum_required(VERSION 3.22.1)
project(mobile_easy_use_native LANGUAGES CXX)

# AGP already runs on a JDK. Copy only JVMTI's platform-independent header;
# jni.h must come from the Android NDK, not the host JDK.
if(NOT EXISTS "${MEU_JDK_INCLUDE}/jvmti.h")
    message(FATAL_ERROR "The build JDK must provide include/jvmti.h")
endif()
configure_file("${MEU_JDK_INCLUDE}/jvmti.h" "${CMAKE_CURRENT_BINARY_DIR}/include/jvmti.h" COPYONLY)
add_library(mobile_easy_use_native SHARED debugger.cpp)
target_compile_features(mobile_easy_use_native PRIVATE cxx_std_17)
target_include_directories(mobile_easy_use_native PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/include")
target_compile_options(mobile_easy_use_native PRIVATE -Wall -Wextra)
