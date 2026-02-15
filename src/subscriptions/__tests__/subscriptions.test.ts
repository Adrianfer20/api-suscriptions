import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/subscriptions endpoints (unauthenticated)', () => {
  it('POST /subscriptions should return 401 when Authorization missing', async () => {
    const res = await request(app).post('/subscriptions').send({ clientId: 'c', startDate: '2026-02-11', cutDate: '2026-03-11' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('GET /subscriptions should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/subscriptions');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('GET /subscriptions/:id should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/subscriptions/abc123');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('PATCH /subscriptions/:id should return 404 when route is not available', async () => {
    const res = await request(app).patch('/subscriptions/abc123').send({ cutDate: '2026-04-11' });
    expect(res.status).to.equal(404);
  });

  it('POST /subscriptions/:id/renew should return 401 when Authorization missing', async () => {
    const res = await request(app).post('/subscriptions/abc123/renew');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});
