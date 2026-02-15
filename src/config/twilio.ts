import twilio from 'twilio';
import { TWILIO_CONFIG } from './index';

let twilioClient: any = null;
if (TWILIO_CONFIG.accountSid && TWILIO_CONFIG.authToken) {
  try {
    twilioClient = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
  } catch (err) {
    twilioClient = null;
  }
}

export default twilioClient;
