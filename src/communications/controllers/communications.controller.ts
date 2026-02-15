import { Request, Response } from 'express';
import communicationsService from '../services/communications.service';

class CommunicationsController {
  async sendTemplate(req: Request, res: Response) {
    const { clientId, template, templateData } = req.body as {
      clientId: string;
      template: string;
      templateData?: Record<string, unknown>;
    };
    try {
      const result = await communicationsService.sendTemplate(clientId, template, templateData);
      return res.json({ ok: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || 'Failed to send message' });
    }
  }

  async sendText(req: Request, res: Response) {
      const { clientId, body } = req.body as { clientId: string; body: string };
      try {
        const result = await communicationsService.sendText(clientId, body);
        return res.json({ ok: true, data: result });
      } catch (err: any) {
        return res.status(400).json({ ok: false, message: err?.message || 'Failed to send text' });
      }
  }

  async getMessages(req: Request, res: Response) {
    let clientId = req.params.clientId as string | string[] | undefined;
    if (Array.isArray(clientId)) clientId = clientId[0];
    if (!clientId) return res.status(400).json({ ok: false, message: 'clientId required' });
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startAfter = typeof req.query.startAfter === 'string' ? req.query.startAfter : undefined;
      const msgs = await communicationsService.getMessagesByClient(clientId, limit, startAfter);
      return res.json({ ok: true, data: msgs });
    } catch (err: any) {
      const status = err?.message === 'Invalid cursor' ? 400 : 500;
      return res.status(status).json({ ok: false, message: err?.message || 'Failed to fetch messages' });
    }
  }

  async webhook(req: Request, res: Response) {
    try {
        const payload = req.body;
        await communicationsService.receive(payload);
        return res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');
    } catch (err: any) {
        console.error('Webhook error:', err);
        return res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');
    }
  }

  async getConversations(req: Request, res: Response) {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : 20;
        const startAfter = typeof req.query.startAfter === 'string' ? req.query.startAfter : undefined;
        const chats = await communicationsService.getConversations(limit, startAfter);
        return res.json({ ok: true, data: chats });
    } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message || 'Failed to fetch conversations' });
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
        const { clientId } = req.params;
        if (!clientId) return res.status(400).json({ ok: false, message: 'clientId required' });
        await communicationsService.markAsRead(String(clientId));
        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message || 'Failed to mark as read' });
    }
  }
}

const communicationsController = new CommunicationsController();
export default communicationsController;
