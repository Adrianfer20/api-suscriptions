import request from 'supertest';
import { expect } from 'chai';
import app from '../../index';

describe('/automation endpoints (unauthenticated)', () => {
  it('POST /automation/run-daily should return 401 when Authorization missing', async () => {
    const res = await request(app).post('/automation/run-daily').send({ reason: 'test' });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('ok', false);
  });
});
