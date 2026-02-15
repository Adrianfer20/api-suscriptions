import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/clients endpoints (unauthenticated)', () => {
  it('POST /clients should return 401 when Authorization missing', async () => {
    const res = await request(app).post('/clients').send({ uid: 'some', name: 'Test' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('GET /clients should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/clients');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('GET /clients/:id should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/clients/abc123');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('PATCH /clients/:id should return 401 when Authorization missing', async () => {
    const res = await request(app).patch('/clients/abc123').send({ name: 'New' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});
