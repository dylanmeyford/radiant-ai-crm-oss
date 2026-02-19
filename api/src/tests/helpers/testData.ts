// helpers/testData.ts
export const STRIPE_TEST_CARDS = {
    valid: '4242424242424242',
    declined: '4000000000000002',
    insufficient: '4000000000009995',
    expired: '4000000000000069',
  };
  
  export const STRIPE_TEST_PAYMENT_METHODS = {
    visa: 'pm_card_visa',
    mastercard: 'pm_card_mastercard',
  };