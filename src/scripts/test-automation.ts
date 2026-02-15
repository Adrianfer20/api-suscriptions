
require('dotenv').config();
import automationService from '../automation/services/automation.service';
import { getTodayInfo } from '../automation/rules/subscription.rules';
import { addDaysTZ } from '../subscriptions/utils/date.util';

async function testAutomation() {
  console.log('--- Testing Automation Logic ---');
  
  const { todayIso, timeZone } = getTodayInfo();
  console.log(`Today (ISO): ${todayIso}`);
  console.log(`TimeZone: ${timeZone}`);
  
  const reminderDate = addDaysTZ(todayIso, 3, timeZone);
  console.log(`Reminder Target Date (+3 days): ${reminderDate}`);
  
  console.log('--- Running Service (Dry Run) ---');
  const result = await automationService.runDaily({ dryRun: true });
  console.log('Result:', JSON.stringify(result, null, 2));
}

testAutomation().catch(e => console.error(e));
