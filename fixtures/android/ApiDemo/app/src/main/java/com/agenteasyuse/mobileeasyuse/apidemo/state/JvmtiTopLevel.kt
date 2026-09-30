package com.agenteasyuse.mobileeasyuse.apidemo.state

fun topLevelCompute(input: Int, box: JvmtiDebuggerFixture.Box, wide: Long, fraction: Double): Int {
    val local = input + 10
    try {
        JvmtiDebuggerFixture.tailCount++ // BP_KOTLIN
        return local + input + wide.toInt() + fraction.toInt() + box.label.length
    } finally {
        JvmtiDebuggerFixture.finallyCount++
    }
}
