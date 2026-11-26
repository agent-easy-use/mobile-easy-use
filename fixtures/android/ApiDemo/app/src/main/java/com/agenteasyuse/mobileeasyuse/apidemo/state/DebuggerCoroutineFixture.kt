package com.agenteasyuse.mobileeasyuse.apidemo.state

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine
import org.json.JSONArray
import java.util.concurrent.atomic.AtomicReference

@JvmField
@Volatile
var coroutineResult = ""

private val pendingContinuation = AtomicReference<Continuation<Int>?>(null)

private suspend fun suspendOnce(): Int =
    suspendCoroutine { continuation -> pendingContinuation.set(continuation) }

suspend fun coroutineUnique(input: Int): Int {
    val before = input + 10
    val resumed = suspendOnce()
    return before + resumed // BP_COROUTINE_UNIQUE
}

suspend fun coroutineOverloaded(input: Int): Int {
    val before = input + 20
    val resumed = suspendOnce()
    return before + resumed // BP_COROUTINE_OVERLOADED
}

suspend fun coroutineOverloaded(input: String): String = input

fun resetCoroutineFixture() {
    coroutineResult = ""
    pendingContinuation.set(null)
}

fun startCoroutineFixture(mode: String, count: Int) {
    Thread({
        try {
            val values = JSONArray()
            repeat(count) { index ->
                var completed: Int? = null
                var failure: Throwable? = null
                val operation: suspend () -> Int = {
                    if (mode == "unique") coroutineUnique(index + 1)
                    else coroutineOverloaded(index + 1)
                }
                operation.startCoroutine(object : Continuation<Int> {
                    override val context = EmptyCoroutineContext

                    override fun resumeWith(result: Result<Int>) {
                        result.onSuccess { completed = it }.onFailure { failure = it }
                    }
                })
                val continuation = pendingContinuation.getAndSet(null)
                    ?: error("coroutine did not suspend")
                continuation.resume(5)
                failure?.let { throw it }
                values.put(completed ?: error("coroutine did not complete"))
            }
            coroutineResult = values.toString()
        } catch (error: Throwable) {
            coroutineResult = "ERROR:$error"
        }
    }, "debugger-coroutine-worker").start()
}
