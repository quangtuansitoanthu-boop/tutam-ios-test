package vn.quangtu.tutam.reminders;

import static org.junit.Assert.*;
import org.junit.Test;

public class ReminderRecurrenceTest {
    @Test public void yearlyAnniversaryUsesTheOrdinaryMonthOnly() {
        assertTrue(ReminderSchedule.matchesLunarDate(15, 2, false, new int[]{15, 2, 2023, 0}, false));
        assertFalse(ReminderSchedule.matchesLunarDate(15, 2, false, new int[]{15, 2, 2023, 1}, false));
    }
    @Test public void monthlyAndLegacyMonthZeroRulesStillIncludeLeapMonths() {
        assertTrue(ReminderSchedule.matchesLunarDate(15, 2, true, new int[]{15, 2, 2023, 1}, false));
        assertTrue(ReminderSchedule.matchesLunarDate(15, 0, false, new int[]{15, 2, 2023, 1}, false));
    }
    @Test public void dayThirtyMovesOnlyToTheLastDayOfAShortMonth() {
        assertTrue(ReminderSchedule.matchesLunarDate(30, 12, false, new int[]{29, 12, 2025, 0}, true));
        assertFalse(ReminderSchedule.matchesLunarDate(30, 12, false, new int[]{29, 12, 2025, 0}, false));
        assertFalse(ReminderSchedule.matchesLunarDate(30, 12, false, new int[]{28, 12, 2025, 0}, false));
        assertTrue(ReminderSchedule.matchesLunarDate(30, 12, false, new int[]{30, 12, 2025, 0}, false));
    }
}
