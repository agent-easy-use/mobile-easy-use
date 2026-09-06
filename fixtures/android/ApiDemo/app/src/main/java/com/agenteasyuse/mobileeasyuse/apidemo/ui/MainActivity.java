package com.agenteasyuse.mobileeasyuse.apidemo.ui;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.agenteasyuse.mobileeasyuse.apidemo.ApiDemoRuntime;
import com.agenteasyuse.mobileeasyuse.apidemo.R;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final List<MenuItem> ITEMS = Arrays.asList(
            new MenuItem(R.id.api_menu_input, "Input", "Click, long press, scroll and text input", InputActivity.class),
            new MenuItem(R.id.api_menu_ui, "UI", "ID/path queries, visibility and runtime wrapper", UiActivity.class),
            new MenuItem(R.id.api_menu_resource, "R / Resources", "Dynamic resource resolution and missing names", ResourceActivity.class),
            new MenuItem(R.id.api_menu_wait, "Wait", "Exist, visible, gone and timeout", WaitActivity.class),
            new MenuItem(R.id.api_menu_window, "Window", "Activity, Dialog and PopupWindow roots", WindowActivity.class),
            new MenuItem(R.id.api_menu_override, "Override", "Method, overload, filter and async cleanup", OverrideActivity.class),
            new MenuItem(R.id.api_menu_evidence, "Evidence", "State, UI and Java/log chain evidence", EvidenceActivity.class));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ApiDemoRuntime.initializeIfRequested(this);

        LinearLayout root = UiFactory.column(this);
        root.setId(R.id.api_main_root);
        root.setBackgroundColor(getColor(R.color.api_background));
        root.addView(UiFactory.title(this, "Android SDK ApiDemo"));
        root.addView(UiFactory.label(this, "Choose an SDK capability"));

        RecyclerView list = new RecyclerView(this);
        list.setId(R.id.api_main_list);
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setAdapter(new MenuAdapter());
        root.addView(list, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));
        setContentView(root);
    }

    private final class MenuAdapter extends RecyclerView.Adapter<MenuHolder> {
        MenuAdapter() { setHasStableIds(true); }

        @Override public long getItemId(int position) { return ITEMS.get(position).id; }
        @Override public int getItemCount() { return ITEMS.size(); }

        @NonNull
        @Override
        public MenuHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            LinearLayout card = UiFactory.card(parent.getContext());
            TextView title = UiFactory.title(parent.getContext(), "");
            title.setTextSize(20);
            TextView description = UiFactory.label(parent.getContext(), "");
            card.addView(title);
            card.addView(description);
            return new MenuHolder(card, title, description);
        }

        @Override
        public void onBindViewHolder(@NonNull MenuHolder holder, int position) {
            MenuItem item = ITEMS.get(position);
            holder.itemView.setId(item.id);
            holder.title.setText(item.title);
            holder.description.setText(item.description);
            holder.itemView.setContentDescription("capability:" + item.title.toLowerCase(Locale.ROOT));
            holder.itemView.setOnClickListener(view -> startActivity(new Intent(MainActivity.this, item.activity)));
        }
    }

    private static final class MenuHolder extends RecyclerView.ViewHolder {
        final TextView title;
        final TextView description;

        MenuHolder(View itemView, TextView title, TextView description) {
            super(itemView);
            this.title = title;
            this.description = description;
        }
    }

    private static final class MenuItem {
        final int id;
        final String title;
        final String description;
        final Class<? extends Activity> activity;

        MenuItem(int id, String title, String description, Class<? extends Activity> activity) {
            this.id = id;
            this.title = title;
            this.description = description;
            this.activity = activity;
        }
    }
}
