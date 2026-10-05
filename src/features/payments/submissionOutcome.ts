/** A lost submission response does not prove that a payment was rejected. */
export class UnknownPaymentSubmissionError extends Error {
  readonly transactionHash: string;

  constructor(transactionHash: string) {
    super('The network has not confirmed the payment result. Check its status before sending again.');
    this.name = 'UnknownPaymentSubmissionError';
    this.transactionHash = transactionHash;
  }
}

export type PaymentSubmissionStatus = 'confirmed' | 'failed' | 'unknown';

export const isTransactionHash = (value: string): boolean => /^[a-f0-9]{64}$/i.test(value);

/** Only an explicit Horizon transaction result proves rejection after submission. */
export const getSubmissionRejectionCode = (error: any): string | null => {
  const code = error?.response?.data?.extras?.result_codes?.transaction;
  return error?.response?.status === 400 && typeof code === 'string' && /^tx_[a-z_]+$/.test(code)
    ? code
    : null;
};
