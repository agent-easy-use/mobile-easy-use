package com.example.helloworld.session

import com.example.helloworld.R

object AuthSession {
    private var displayName = ""
    private var account = ""

    @JvmStatic
    fun login(account: String, password: String): AuthResult {
        val validation = validateCredentials(account, password)
        if (validation != null) return AuthResult(false, validation)

        this.account = account
        displayName = account.substringBefore('@').ifBlank { "Explorer" }
        return AuthResult(true)
    }

    @JvmStatic
    fun createAccount(
        name: String,
        account: String,
        password: String,
        confirmation: String,
        acceptedTerms: Boolean,
    ): AuthResult {
        if (name.length < 2) return AuthResult(false, R.string.error_name_too_short)
        val validation = validateCredentials(account, password)
        if (validation != null) return AuthResult(false, validation)
        if (password != confirmation) return AuthResult(false, R.string.error_passwords_mismatch)
        if (!acceptedTerms) return AuthResult(false, R.string.error_terms_required)

        this.account = account
        displayName = name
        return AuthResult(true)
    }

    @JvmStatic
    fun logout() {
        displayName = ""
        account = ""
    }

    @JvmStatic fun getDisplayName(): String = displayName.ifBlank { "Explorer" }
    @JvmStatic fun getAccount(): String = account

    private fun validateCredentials(account: String, password: String): Int? {
        if (account.length < 3) return R.string.error_invalid_account
        if (password.length < 6) return R.string.error_password_too_short
        return null
    }
}
