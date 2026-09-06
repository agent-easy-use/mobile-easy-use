package com.example.helloworld.ui.auth;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.example.helloworld.R;
import com.example.helloworld.session.AuthResult;
import com.example.helloworld.session.AuthSession;
import com.example.helloworld.ui.home.HomeActivity;

public class AuthActivity extends Activity {
    private boolean registerMode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_auth);
        bindAuthForm();
        Log.d("HelloWorld", "Android native fixture started");
    }

    private void bindAuthForm() {
        TextView loginTab = findViewById(R.id.auth_login_tab);
        TextView registerTab = findViewById(R.id.auth_register_tab);
        LinearLayout registerNameFields = findViewById(R.id.auth_register_name_fields);
        LinearLayout registerExtraFields = findViewById(R.id.auth_register_extra_fields);
        EditText nameInput = findViewById(R.id.auth_name_input);
        EditText accountInput = findViewById(R.id.auth_account_input);
        EditText passwordInput = findViewById(R.id.auth_password_input);
        EditText confirmInput = findViewById(R.id.auth_confirm_password_input);
        CheckBox terms = findViewById(R.id.auth_terms_checkbox);
        TextView error = findViewById(R.id.auth_error);
        Button submit = findViewById(R.id.auth_submit);

        View.OnClickListener switchMode = view -> {
            registerMode = view.getId() == R.id.auth_register_tab;
            registerNameFields.setVisibility(registerMode ? View.VISIBLE : View.GONE);
            registerExtraFields.setVisibility(registerMode ? View.VISIBLE : View.GONE);
            loginTab.setBackgroundResource(registerMode ? R.drawable.bg_tab_idle : R.drawable.bg_tab_selected);
            registerTab.setBackgroundResource(registerMode ? R.drawable.bg_tab_selected : R.drawable.bg_tab_idle);
            loginTab.setTextColor(getColor(registerMode ? R.color.text_secondary : R.color.white));
            registerTab.setTextColor(getColor(registerMode ? R.color.white : R.color.text_secondary));
            submit.setText(registerMode ? R.string.create_account : R.string.login_continue);
            error.setVisibility(View.GONE);
            confirmInput.setImeOptions(registerMode ? EditorInfo.IME_ACTION_DONE : EditorInfo.IME_ACTION_NONE);
        };
        loginTab.setOnClickListener(switchMode);
        registerTab.setOnClickListener(switchMode);

        submit.setOnClickListener(view -> {
            AuthResult result = registerMode
                ? AuthSession.createAccount(
                    textOf(nameInput),
                    textOf(accountInput),
                    passwordInput.getText().toString(),
                    confirmInput.getText().toString(),
                    terms.isChecked()
                )
                : AuthSession.login(textOf(accountInput), passwordInput.getText().toString());

            if (result.getSuccess()) {
                error.setVisibility(View.GONE);
                Toast.makeText(this, registerMode ? R.string.register_success : R.string.login_success, Toast.LENGTH_SHORT).show();
                startActivity(new Intent(this, HomeActivity.class));
                finish();
            } else {
                error.setText(result.getMessageResId());
                error.setVisibility(View.VISIBLE);
            }
        });

        accountInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_NEXT) {
                passwordInput.requestFocus();
                return true;
            }
            return false;
        });
        passwordInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE && !registerMode) {
                submit.performClick();
                return true;
            }
            return false;
        });
        confirmInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                submit.performClick();
                return true;
            }
            return false;
        });
    }

    private static String textOf(EditText input) {
        return input.getText().toString().trim();
    }
}
