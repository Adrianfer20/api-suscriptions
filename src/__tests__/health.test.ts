import request from 'supertest';
import { expect } from 'chai';
import app from '../index';

describe('health endpoint', () => {
  it('GET / should return status ok', async () => {
    const res = await request(app).get('/');
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('status', 'ok');
  });
});
