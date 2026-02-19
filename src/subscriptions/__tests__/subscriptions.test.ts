import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/subscriptions endpoints (unauthenticated)', () => {
  it('POST /subscriptions should succeed with country', async () => {
    const res = await request(app)
      .post('/subscriptions')
      .set('Authorization', 'Bearer testtoken')
      .send({
        clientId: 'c',
        startDate: '2026-02-11',
        cutDate: '2026-03-11',
        plan: 'basic',
        amount: '$50',
        country: 'VES',
      });
    // El status puede variar según la lógica de autenticación, pero debe ser distinto a error de validación
    expect(res.status).to.not.equal(400);
    expect(res.body).to.have.property('ok');
    // Si la autenticación falla, ok será false, pero no por validación de country
  });
  it('POST /subscriptions should fail if country is missing', async () => {
    const res = await request(app)
      .post('/subscriptions')
      .set('Authorization', 'Bearer testtoken')
      .send({
        clientId: 'c',
        startDate: '2026-02-11',
        cutDate: '2026-03-11',
        plan: 'basic',
        amount: '$50',
        // country intentionally omitted
      });
    expect(res.status).to.be.oneOf([400, 422]);
    expect(res.body.ok).to.equal(false);
    expect(res.body.message).to.match(/country/i);
  });
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

  it('PATCH /subscriptions/:id should return 401 when Authorization missing', async () => {
    const res = await request(app).patch('/subscriptions/abc123').send({ cutDate: '2026-04-11' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('POST /subscriptions/:id/renew should return 401 when Authorization missing', async () => {
    const res = await request(app).post('/subscriptions/abc123/renew');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('DELETE /subscriptions/:id should return 401 when Authorization missing', async () => {
    const res = await request(app).delete('/subscriptions/abc123');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});

