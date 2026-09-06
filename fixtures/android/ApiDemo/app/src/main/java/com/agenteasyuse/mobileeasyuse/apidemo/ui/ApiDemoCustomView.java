package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

public final class ApiDemoCustomView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public ApiDemoCustomView(Context context) {
        super(context);
        paint.setColor(0xFF3157C8);
        setContentDescription("ApiDemoCustomView");
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawCircle(getWidth() / 2f, getHeight() / 2f, Math.min(getWidth(), getHeight()) / 3f, paint);
    }
}
