package at.tripti.staff;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Printing and file saving for the web screens (see StaffAppPlugin).
        registerPlugin(StaffAppPlugin.class);
        super.onCreate(savedInstanceState);
        // Kitchen and service screens stay on during service.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
