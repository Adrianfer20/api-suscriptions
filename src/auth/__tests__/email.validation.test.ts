import { body, validationResult } from 'express-validator';
import { expect } from 'chai';

describe('email validation', () => {
  it('accepts normal gmail', async () => {
    const req: any = { body: { email: 'user@gmail.com' } };
    await body('email')
      .isEmail().withMessage('Invalid email')
      .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false })
      .run(req as any);

    const errors = validationResult(req as any);
    expect(errors.isEmpty()).to.be.true;
    expect(req.body.email).to.equal('user@gmail.com');
  });

  it('accepts gmail with +local', async () => {
    const req: any = { body: { email: 'user+local@gmail.com' } };
    await body('email')
      .isEmail().withMessage('Invalid email')
      .normalizeEmail({ gmail_remove_dots: false, gmail_remove_subaddress: false })
      .run(req as any);

    const errors = validationResult(req as any);
    expect(errors.isEmpty()).to.be.true;
    expect(req.body.email).to.equal('user+local@gmail.com');
  });
});
