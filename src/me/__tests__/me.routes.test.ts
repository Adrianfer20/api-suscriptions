import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/me endpoints (unauthenticated)', () => {
  it('GET /me should return 401 when Authorization missing', async () => {
    const res = await request(app).get('/me');
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});
