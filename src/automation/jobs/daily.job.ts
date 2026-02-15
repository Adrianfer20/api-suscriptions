import cron, { ScheduledTask } from 'node-cron';
import automationService from '../services/automation.service';

type JobState = {
  task?: ScheduledTask;
};

const state: JobState = {};

export function isJobScheduled() {
  return !!state.task;
}

export function stopDailyAutomationJob() {
  if (state.task) {
    state.task.stop();
    state.task = undefined;
    console.info('[automation] Daily job stopped.');
  }
}

export async function startDailyAutomationJob() {
  // Stop existing task if any
  stopDailyAutomationJob();

  // Optional: check environment variable overload
  if (process.env.AUTOMATION_JOB_DISABLED === 'true') {
     console.info('[automation] Daily job disabled via AUTOMATION_JOB_DISABLED flag');
     return;
  }

  try {
    const config = await automationService.getSchedulerConfig();
    
    if (!config.enabled) {
      console.info('[automation] Daily job is disabled in configuration.');
      return;
    }

    const expression = config.cronExpression;
    const timeZone = config.timeZone;

    if (!cron.validate(expression)) {
      console.error(`[automation] Invalid cron expression: ${expression}`);
      return;
    }

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

  } catch (err) {
    console.error('[automation] Failed to start daily job:', err);
  }
}

export async function restartDailyAutomationJob() {
  console.info('[automation] Restarting daily job due to configuration change...');
  await startDailyAutomationJob();
}

