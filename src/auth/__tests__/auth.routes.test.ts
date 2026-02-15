import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/auth endpoints (unauthenticated)', () => {
  it('POST /auth/create should return 401 when Authorization missing', async () => {
    const res = await request(app)
      .post('/auth/create')
      .send({ email: 'user@example.com', password: 'secret123', displayName: 'User', role: 'client' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });

  it('GET /auth/me should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});
