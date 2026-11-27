package vn.quangtu.tutam.audio;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import java.util.Set;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class DharmaAudioCacheEvictionTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    private void finish(File marker, Set<String> retained) throws Exception {
        Method method = DharmaAudioPlugin.class.getDeclaredMethod("finishCacheEviction", File.class, Set.class);
        method.setAccessible(true);
        method.invoke(null, marker, retained);
    }

    @Test public void keepsQueuedBytesUntilTheQueueReleasesTheFile() throws Exception {
        File target = temporary.newFile("track.audio");
        File partial = temporary.newFile("track.partial");
        File marker = temporary.newFile("track.audio.evict");
        File unrelated = temporary.newFile("another.audio");
        Files.write(target.toPath(), "saved media".getBytes(StandardCharsets.UTF_8));
        finish(marker, Collections.singleton(target.getAbsolutePath()));
        assertEquals("saved media", new String(Files.readAllBytes(target.toPath()), StandardCharsets.UTF_8));
        assertTrue(partial.isFile());
        assertTrue(marker.isFile());
        finish(marker, Collections.emptySet());
        assertFalse(target.exists());
        assertFalse(partial.exists());
        assertFalse(marker.exists());
        assertTrue(unrelated.isFile());
    }

    @Test public void keepsTheMarkerAndOriginalDataWhenDeletionFails() throws Exception {
        File target = temporary.newFolder("blocked.audio");
        File original = new File(target, "original");
        Files.write(original.toPath(), "retain".getBytes(StandardCharsets.UTF_8));
        File marker = temporary.newFile("blocked.audio.evict");
        try {
            finish(marker, Collections.emptySet());
            fail("A failed file deletion must remain retryable");
        } catch (InvocationTargetException error) {
            assertTrue(error.getCause() instanceof IOException);
        }
        assertTrue(marker.isFile());
        assertEquals("retain", new String(Files.readAllBytes(original.toPath()), StandardCharsets.UTF_8));
    }
}
