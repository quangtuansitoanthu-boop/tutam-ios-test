package vn.quangtu.tutam;

import android.util.AtomicFile;
import android.util.Base64;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

@CapacitorPlugin(name = "DivinationHistory")
public class DivinationHistoryPlugin extends Plugin {
    private AtomicFile historyFile(PluginCall call) {
        String key = call.getString("key");
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), historyFileName(key)));
    }

    private static String legacyHistoryFileName(String key) {
        if (key == null || key.isEmpty() || key.length() > 160) {
            throw new IllegalArgumentException("Invalid history key");
        }
        String name = Base64.encodeToString(key.getBytes(StandardCharsets.UTF_8),
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        return "divination-" + name + ".json";
    }

    static String historyFileName(String key) {
        String legacy = legacyHistoryFileName(key);
        // Keep existing short-key files, including AtomicFile's .bak/.new sidecars.
        if (legacy.length() + ".bak".length() <= 255) return legacy;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(64);
            for (byte value : digest) hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            return "divination-sha256." + hash + ".json";
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            AtomicFile target = historyFile(call);
            byte[] bytes;
            try { bytes = target.readFully(); }
            catch (FileNotFoundException missing) {
                String legacy = legacyHistoryFileName(call.getString("key"));
                // An older AtomicFile may have created a 252–255 byte base before its sidecar failed.
                if (legacy.length() > 255 || legacy.equals(target.getBaseFile().getName())) throw missing;
                bytes = new AtomicFile(new File(getContext().getNoBackupFilesDir(), legacy)).readFully();
            }
            String value = new String(bytes, StandardCharsets.UTF_8);
            call.resolve(new JSObject().put("value", value));
        } catch (FileNotFoundException error) {
            call.resolve(new JSObject().put("value", "[]"));
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Unable to read local divination history");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("Missing divination history");
            return;
        }
        try {
            AtomicFile file = historyFile(call);
            FileOutputStream output = file.startWrite();
            try {
                output.write(value.getBytes(StandardCharsets.UTF_8));
                file.finishWrite(output);
            } catch (IOException error) {
                file.failWrite(output);
                throw error;
            }
            call.resolve();
        } catch (IOException | IllegalArgumentException error) {
            call.reject("Unable to write local divination history");
        }
    }

    private static void removeHistoryFiles(File directory, String name) throws IOException {
        for (String suffix : new String[]{"", ".bak", ".new"}) {
            // Encoded names are ASCII; oversized legacy sidecars cannot exist on this filesystem.
            if (name.length() + suffix.length() > 255) continue;
            File file = new File(directory, name + suffix);
            if (file.isDirectory()) throw new IOException("History path is not a file");
            // delete() returns false for both absence and I/O failure. Only ENOENT proves absence.
            file.delete();
            try {
                Os.lstat(file.getAbsolutePath());
            } catch (ErrnoException error) {
                if (error.errno == OsConstants.ENOENT) continue;
                throw new IOException("Unable to verify history removal");
            }
            throw new IOException("History file remains after removal");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            String key = call.getString("key");
            String name = historyFileName(key);
            String legacy = legacyHistoryFileName(key);
            File directory = getContext().getNoBackupFilesDir();
            if (directory == null) throw new IOException("History storage is unavailable");
            removeHistoryFiles(directory, name);
            if (!legacy.equals(name)) removeHistoryFiles(directory, legacy);
            call.resolve();
        } catch (IOException | IllegalArgumentException | SecurityException error) {
            call.reject("Unable to remove local divination history");
        }
    }
}
