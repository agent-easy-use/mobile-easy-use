package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.agenteasyuse.mobileeasyuse.apidemo.R;

final class UiFactory {
    private UiFactory() {}

    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static LinearLayout column(Context context) {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(context, 20), dp(context, 20), dp(context, 20), dp(context, 20));
        return view;
    }

    static TextView title(Context context, String text) {
        TextView view = new TextView(context);
        view.setText(text);
        view.setTextSize(24);
        view.setTextColor(context.getColor(R.color.api_text));
        view.setPadding(0, 0, 0, dp(context, 8));
        return view;
    }

    static TextView label(Context context, String text) {
        TextView view = new TextView(context);
        view.setText(text);
        view.setTextSize(15);
        view.setTextColor(context.getColor(R.color.api_secondary));
        view.setPadding(dp(context, 12), dp(context, 12), dp(context, 12), dp(context, 12));
        return view;
    }

    static Button button(Context context, String text, int id) {
        Button button = new Button(context);
        button.setId(id);
        button.setText(text);
        button.setAllCaps(false);
        button.setMinHeight(dp(context, 52));
        return button;
    }

    static LinearLayout card(Context context) {
        LinearLayout card = column(context);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(context, 14));
        card.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(context, 12));
        card.setLayoutParams(params);
        return card;
    }

    static TextView centeredTarget(Context context, String text, int id) {
        TextView target = label(context, text);
        target.setId(id);
        target.setGravity(Gravity.CENTER);
        target.setBackgroundColor(0xFFE8EEFF);
        target.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(context, 64)));
        return target;
    }
}
