import cron, { ScheduledTask } from 'node-cron';
import automationService from '../services/automation.service';

type JobState = {
  task?: ScheduledTask;
};

const state: JobState = {};
const DEFAULT_CRON = '7 0 * * *'; // Every day at 00:00
const DEFAULT_TZ = 'America/Caracas';

export function startDailyAutomationJob() {
  if (process.env.AUTOMATION_JOB_DISABLED === 'true') {
    console.info('[automation] Daily job disabled via AUTOMATION_JOB_DISABLED flag');
    return;
  }
  if (state.task) {
    return;
  }

  const expression = process.env.AUTOMATION_CRON || DEFAULT_CRON;
  const timeZone = process.env.AUTOMATION_TZ || DEFAULT_TZ;

  state.task = cron.schedule(
    expression,
    async () => {
      console.info(`[automation] Running daily job at ${new Date().toISOString()}`);
      try {
        const result = await automationService.runDaily({ invokedBy: 'scheduler' });
        console.info(`[automation] Job finished. Processed: ${result.processedCount}, Sent: ${result.notificationsSent}, Cut: ${result.subscriptionsCut}`);
      } catch (err) {
        console.error('[automation] Daily job failed', err);
      }
    },
    { timezone: timeZone }
  );

  console.info(`[automation] Daily job scheduled (${expression}) tz=${timeZone}`);
}
