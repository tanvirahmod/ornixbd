export type TranslationKey =
  | 'brandName'
  | 'home'
  | 'shop'
  | 'feedback'
  | 'madeInBangladesh'
  | 'wearYourStory'
  | 'premiumFashion'
  | 'shopCollection'
  | 'explore'
  | 'freeDelivery'
  | 'qualityGuaranteed'
  | 'bkashPayment'
   | 'allProducts'
   | 'discountedProducts'
  | 'discountedProductsSubtitle'
  | 'newArrivals'
  | 'newArrivalsSubtitle'
  | 'noDiscountedProducts'
  | 'noNewArrivals'
  | 'itemsCountOne'
  | 'itemsCountMany'
  | 'searchPlaceholder'
  | 'all'
  | 'noProductsFound'
  | 'noProductsMatchSearch'
  | 'noProductsInCategory'
  | 'checkBackSoon'
  | 'viewAllProducts'
  | 'productNotFound'
  | 'backToHome'
  | 'selectSize'
  | 'onlyLeft'
  | 'inStock'
  | 'outOfStock'
  | 'description'
  | 'deliveryAcrossBangladesh'
  | 'qualityAssured'
  | 'buyNowPrice'
  | 'checkout'
  | 'completeYourOrder'
  | 'orderSummary'
  | 'productPrice'
  | 'discount'
  | 'deliveryFee'
  | 'totalToPay'
  | 'yourDetails'
  | 'fullName'
  | 'phoneNumber'
  | 'deliveryAddress'
  | 'bkashPaymentHeading'
  | 'bkashPaymentInstruction'
  | 'yourBkashNumber'
  | 'transactionId'
  | 'placingOrder'
  | 'confirmOrder'
  | 'infoSecure'
  | 'orderPlaced'
  | 'thankYou'
  | 'weWillContact'
  | 'continueShopping'
  | 'messageSent'
  | 'sendUsFeedback'
  | 'feedbackSubtitle'
  | 'yourName'
  | 'email'
  | 'message'
  | 'writeYourMessageHere'
  | 'securityCheck'
  | 'newCaptcha'
  | 'sendFeedback'
  | 'sending'
  | 'backToStore'
  | 'admin'
  | 'nameRequired'
  | 'emailRequired'
  | 'enterValidEmail'
  | 'messageRequired'
  | 'messageTooShort'
  | 'captchaRequired'
  | 'wrongCaptcha'
  | 'fullNameRequired'
  | 'phoneRequired'
  | 'phoneInvalid'
  | 'phoneInvalidBd'
  | 'addressRequired'
  | 'addressTooShort'
  | 'bkashNumberRequired'
  | 'bkashNumberInvalid'
  | 'trxIdRequired'
  | 'somethingWentWrong'
  | 'feedbackReceived'
  | 'productPageDescriptionTitle'
  | 'deliveryAcrossBd'
  | 'qualityAssuredShort'
   | 'homeBreadcrumb'
   | 'addToCart'
   | 'backToProduct'
   | 'collections'
   | 'newestArrivals'
   | 'priceLowToHigh'
   | 'priceHighToLow'
   | 'categoryNotFound'
   | 'backToCollections'
   | 'seeAll'
   | 'addToCartButton'
   | 'addedToCart'
   | 'cartTitle'
   | 'cartEmpty'
   | 'cartEmptySubtitle'
   | 'clearCart'
   | 'removeItem'
   | 'subtotal'
   | 'freeDeliveryShort'
   | 'proceedToCheckout'
   | 'sizeLabel'
   | 'qtyLabel'
   | 'increaseQuantity'
   | 'decreaseQuantity'
   | 'orderPlacedSuffix'
   | 'productUnavailableTitle'
   | 'productUnavailableBody'
 | 'productUnavailableThanks'
 | 'orderOnWhatsApp'
 | 'checkoutSecure'
 | 'stepAddress'
 | 'stepDelivery'
 | 'stepPayment'
 | 'stepOf'
 | 'addressHeading'
 | 'addressSubtitle'
 | 'enterYourFullName'
 | 'phonePlaceholder'
 | 'fullAddressPlaceholder'
 | 'continueToDelivery'
 | 'deliveryHeading'
 | 'deliverySubtitle'
 | 'recapAddress'
 | 'recapDelivery'
 | 'editRecap'
 | 'homeDeliveryName'
 | 'homeDeliveryDesc'
 | 'courierEta'
 | 'pickupName'
 | 'pickupDesc'
 | 'pickupEta'
 | 'deliveryCallNote'
 | 'back'
 | 'continueToPayment'
 | 'paymentHeading'
 | 'payDeliveryNowTitle'
 | 'payDeliveryNowDesc'
 | 'payNothingNowDesc'
 | 'payFullNowTitle'
 | 'payFullNowDesc'
 | 'fullAdvanceRequiredNote'
 | 'paymentInstructionsTitle'
 | 'sendMoneyInstruction'
 | 'bkashPersonalLabel'
 | 'advanceAmountLabel'
 | 'dueOnDeliveryLabel'
 | 'senderBkashLabel'
 | 'senderBkashPlaceholder'
 | 'senderBkashHint'
 | 'codOnlyTitle'
 | 'codOnlyDesc'
 | 'codNote'
 | 'codBadge'
 | 'trustSecure'
 | 'trustNationwide'
 | 'trustBkashCod'
 | 'copyShort'
 | 'copiedShort'
 | 'checkoutTitle'
 | 'bdOnlyCaution'
 | 'districtRequired'
 | 'districtFeeHint'
 | 'trxIdInvalid'
 | 'agreePrefix'
 | 'agreeTermsLink'
 | 'agreeAnd'
 | 'agreePrivacyLink'
 | 'mustAgreeTerms'
 | 'placeOrder'
 | 'shippingRowLabel'
 | 'couponCode'
 | 'couponPlaceholder'
 | 'couponApply'
 | 'couponAppliedMsg'
 | 'couponInvalid'
 | 'couponExpired'
 | 'couponMinOrder'
 | 'couponProductsOnly'
 | 'couponRemove'
 | 'orderCodeLabel'
 | 'orderCodeSaveNote'
 | 'districtLabel'
 | 'districtPlaceholder'
 | 'districtCountHint'
 | 'zoneInsideDhaka'
 | 'zoneDhakaSuburban'
 | 'zoneOutsideDhaka'
 | 'pickupPayTitle'
 | 'pickupPayDesc';

interface TranslationMap {
  [key: string]: string;
}

const en: TranslationMap = {
  brandName: 'Ornix',
  home: 'Home',
  shop: 'Shop',
  feedback: 'Feedback',
  madeInBangladesh: 'Made in Bangladesh',
  wearYourStory: 'Wear your story',
  premiumFashion:
    'Premium fashion crafted in Bangladesh. Quality fabrics, modern designs, delivered to your door across the country.',
  shopCollection: 'Shop Collection',
  explore: 'Explore',
  freeDelivery: 'Free delivery over ৳1000',
  qualityGuaranteed: 'Quality guaranteed',
  bkashPayment: 'bKash payment',
  allProducts: 'All Products',
  discountedProducts: 'Discounted Products',
  discountedProductsSubtitle: 'Our best offers are updated automatically when discounts are applied.',
  newArrivals: 'New Arrivals',
  newArrivalsSubtitle: 'This section updates automatically with the latest added products.',
  noDiscountedProducts: 'No discounted products available right now.',
  noNewArrivals: 'No new arrivals yet. Check back soon.',
  itemsCountOne: '1 item',
  itemsCountMany: '{{count}} items',
  searchPlaceholder: 'Search products by name or code...',
  all: 'All',
  noProductsFound: 'No products found',
  noProductsMatchSearch: 'No products match your search. Try a different keyword.',
  noProductsInCategory: 'No products in this category yet.',
  checkBackSoon: 'Check back soon for new arrivals.',
  viewAllProducts: 'View all products',
  productNotFound: 'Product not found.',
  backToHome: 'Back to Home',
  selectSize: 'Select Size',
  onlyLeft: 'Only {{count}} left!',
  inStock: '{{count}} in stock',
  outOfStock: 'Out of stock',
  description: 'Description',
  deliveryAcrossBangladesh: 'Delivery across Bangladesh',
  qualityAssured: 'Quality assured',
  buyNowPrice: 'Buy Now — ৳{{price}}',
  checkout: 'Checkout',
  completeYourOrder: 'Complete Your Order',
  orderSummary: 'Order Summary',
  productPrice: 'Product price',
  discount: 'Discount',
  deliveryFee: 'Delivery fee',
  totalToPay: 'Total to pay',
  yourDetails: 'Your Details',
  fullName: 'Full Name',
  phoneNumber: 'Phone Number',
  deliveryAddress: 'Delivery Address',
  bkashPaymentHeading: 'bKash Payment',
  bkashPaymentInstruction:
    'Please advance the Tk 150 fee to our bKash Personal number {{bkashNumber}}, and write below your bKash number and the TrxID (Transaction ID) to confirm your request.',
  yourBkashNumber: 'Your bKash Number',
  transactionId: 'Transaction ID (TrxID)',
  placingOrder: 'Placing Order...',
  confirmOrder: 'Confirm Order',
  infoSecure: 'Your information is secure',
  orderPlaced: 'Order Placed!',
  thankYou: 'Thank you, {{name}}!',
  weWillContact: "We'll contact you at {{phone}} to confirm your order.",
  continueShopping: 'Continue Shopping',
  messageSent: 'Message Sent!',
  feedbackReceived: "We've received your feedback and will get back to you soon.",
  backToProduct: 'Back to product',
  admin: 'Admin',
  fullNameRequired: 'Full name is required',
  phoneRequired: 'Phone number is required',
  phoneInvalid: 'Enter a valid phone number',
  phoneInvalidBd: 'Enter a valid Bangladeshi mobile number (e.g. 01712345678)',
  addressRequired: 'Delivery address is required',
  addressTooShort: 'Please write your full address (house, road, area, district)',
  bkashNumberRequired: 'Your bKash number is required',
  bkashNumberInvalid: 'Enter a valid bKash number',
  trxIdRequired: 'Transaction ID is required',
  sendUsFeedback: 'Send Us Feedback',
  feedbackSubtitle: "Have a question, suggestion, or complaint? We'd love to hear from you.",
  yourName: 'Your Name',
  email: 'Email',
  message: 'Message',
  writeYourMessageHere: 'Write your message here...',
  securityCheck: 'Security Check',
  newCaptcha: 'New captcha',
  sendFeedback: 'Send Feedback',
  sending: 'Sending...',
  backToStore: 'Back to Store',
  nameRequired: 'Your name is required',
  emailRequired: 'Email is required',
  enterValidEmail: 'Enter a valid email',
  messageRequired: 'Please write your message',
  messageTooShort: 'Message is too short',
  captchaRequired: 'Please solve the captcha',
  wrongCaptcha: 'Wrong answer, try again',
  somethingWentWrong: 'Something went wrong. Please try again.',
  productPageDescriptionTitle: 'Description',
  deliveryAcrossBd: 'Delivery across Bangladesh',
  qualityAssuredShort: 'Quality assured',
  homeBreadcrumb: 'Home',
  addToCart: 'Buy Now — ৳{{price}}',
  collections: 'Collections',
  newestArrivals: 'Newest Arrivals',
  priceLowToHigh: 'Price: Low to High',
  priceHighToLow: 'Price: High to Low',
  categoryNotFound: 'Category not found',
  backToCollections: 'Back to Collections',
  seeAll: 'See All',
  addToCartButton: 'Add to Cart',
  addedToCart: 'Added to Cart ✓',
  cartTitle: 'Your Cart',
  cartEmpty: 'Your cart is empty',
  cartEmptySubtitle: 'Browse our collections and add something you love.',
  clearCart: 'Clear cart',
  removeItem: 'Remove item',
  subtotal: 'Subtotal',
  freeDeliveryShort: 'Free',
  proceedToCheckout: 'Proceed to Checkout',
  sizeLabel: 'Size',
  qtyLabel: 'Qty',
  increaseQuantity: 'Increase quantity',
  decreaseQuantity: 'Decrease quantity',
  orderPlacedSuffix: 'ordered successfully',
  productUnavailableTitle: 'Sold Out — Back Soon!',
  productUnavailableBody:
    "This piece is fully stocked out right now, but it's not gone for good. Once we bring it back, you'll be able to order it right here — first come, first served.",
  productUnavailableThanks: 'Thank you for staying with Ornix 💛',
  orderOnWhatsApp: 'Order on WhatsApp',
  checkoutSecure: 'Secure checkout',
  stepAddress: 'Address',
  stepDelivery: 'Delivery',
  stepPayment: 'Payment',
  stepOf: 'Step {{current}} of {{total}}',
  addressHeading: 'Delivery Address',
  addressSubtitle: 'Where should we deliver your order?',
  enterYourFullName: 'Enter your full name',
  phonePlaceholder: '+8801721415263',
  fullAddressPlaceholder: 'House, Road, Area, District — full delivery address',
  continueToDelivery: 'Continue to Delivery',
  deliveryHeading: 'Delivery Method',
  deliverySubtitle: 'Choose how you want your order delivered.',
  recapAddress: 'Deliver to',
  recapDelivery: 'Delivery method',
  editRecap: 'Edit',
  homeDeliveryName: 'Home Delivery — Nationwide Courier',
  homeDeliveryDesc: 'Delivered to your door anywhere in Bangladesh.',
  courierEta: 'Inside Dhaka 1–2 days · Outside Dhaka 3–5 days',
  pickupName: 'Store Pickup',
  pickupDesc: 'Collect your order yourself from our pickup point.',
  pickupEta: 'Ready within 24 hours of confirmation — no delivery fee',
  deliveryCallNote: 'We confirm every order with a quick phone call before dispatch — please keep your phone reachable.',
  back: 'Back',
  continueToPayment: 'Continue to Payment',
  paymentHeading: 'Payment',
  payDeliveryNowTitle: 'Pay delivery fee now, rest on delivery',
  payDeliveryNowDesc: 'Send ৳{{advance}} now via bKash, pay the remaining ৳{{due}} in cash when your parcel arrives.',
  payNothingNowDesc: 'Nothing to pay now — just pay ৳{{due}} in cash when your parcel arrives.',
  payFullNowTitle: 'Pay full amount in advance',
  payFullNowDesc: 'Send the full ৳{{total}} now via bKash — nothing to pay on delivery.',
  fullAdvanceRequiredNote: 'Orders of ৳{{threshold}} or more must be paid fully in advance.',
  paymentInstructionsTitle: 'How to pay the advance',
  sendMoneyInstruction: 'Send Money (not Cash Out) the advance amount to our personal bKash number below, then enter your bKash number and the TrxID from the confirmation SMS.',
  bkashPersonalLabel: 'bKash (Personal)',
  advanceAmountLabel: 'Send now',
  dueOnDeliveryLabel: 'Pay on delivery',
  senderBkashLabel: 'Your bKash number',
  senderBkashPlaceholder: 'The number you sent money from',
  senderBkashHint: 'Used only to verify your payment — never shared.',
  codOnlyTitle: 'Cash on delivery — no advance',
  codOnlyDesc: 'No bKash advance needed — just pay the full ৳{{total}} in cash when your parcel arrives.',
  codNote: 'Payment is collected by the delivery agent at your door.',
  codBadge: 'Cash on delivery',
  trustSecure: 'Secure checkout',
  trustNationwide: 'Nationwide delivery across Bangladesh',
  trustBkashCod: 'bKash advance or cash on delivery',
  copyShort: 'Copy',
  copiedShort: 'Copied!',
  checkoutTitle: 'Check Out',
  bdOnlyCaution: 'We deliver inside Bangladesh only. Please make sure your delivery address is in Bangladesh — orders with Indian or other international addresses cannot be processed.',
  districtRequired: 'Select your district so we can charge the correct courier fee.',
  districtFeeHint: 'Please go back and select your district in the address step — the courier fee depends on it.',
  trxIdInvalid: 'Enter the TrxID from your bKash confirmation SMS',
  agreePrefix: 'I agree to the',
  agreeTermsLink: 'Terms & Conditions',
  agreeAnd: 'and',
  agreePrivacyLink: 'Privacy Policy',
  mustAgreeTerms: 'Please accept the terms to place your order',
  placeOrder: 'Place Order',
  shippingRowLabel: 'Shipping',
  couponCode: 'Coupon code',
  couponPlaceholder: 'Enter code',
  couponApply: 'Apply',
  couponAppliedMsg: '{{code}} applied — you saved ৳{{amount}}',
  couponInvalid: 'This coupon code is not valid',
  couponExpired: 'This coupon has expired',
  couponMinOrder: 'This coupon needs a minimum order of ৳{{amount}}',
  couponProductsOnly: 'Only valid for: {{codes}}',
  couponRemove: 'Remove coupon',
  orderCodeLabel: 'Your order code',
  orderCodeSaveNote: 'Save this code — use it on the “Track Order” page anytime.',
  districtLabel: 'District / Zone',
  districtPlaceholder: 'Select your district…',
  districtCountHint: '{{count}} districts covered — the courier fee is set from your zone.',
  zoneInsideDhaka: 'Inside Dhaka',
  zoneDhakaSuburban: 'Dhaka Suburban',
  zoneOutsideDhaka: 'Outside Dhaka',
  pickupPayTitle: 'Pay in full at our store',
  pickupPayDesc: 'Collect your order at our store and pay the full ৳{{amount}} in cash there.',
};

// Bengali for the checkout flow (all 3 steps + success screen).
// Customers order in Bangla; district VALUES stay English (they drive the
// courier zone pricing), only the displayed labels are translated.
const bn: TranslationMap = {
  brandName: 'অরনিক্স',
  home: 'হোম',
  continueShopping: 'কেনাকাটা চালিয়ে যান',
  freeDeliveryShort: 'ফ্রি',
  sizeLabel: 'সাইজ',
  qtyLabel: 'পরিমাণ',
  itemsCountOne: '১টি আইটেম',
  itemsCountMany: '{{count}}টি আইটেম',
  checkoutTitle: 'চেকআউট',
  checkoutSecure: 'নিরাপদ চেকআউট',
  stepAddress: 'ঠিকানা',
  stepDelivery: 'ডেলিভারি',
  stepPayment: 'পেমেন্ট',
  stepOf: 'ধাপ {{current}} / {{total}}',
  back: 'পেছনে',
  editRecap: 'পরিবর্তন',
  addressHeading: 'ডেলিভারি ঠিকানা',
  addressSubtitle: 'আপনার অর্ডার কোথায় পৌঁছে দেব?',
  fullName: 'পুরো নাম',
  enterYourFullName: 'আপনার পুরো নাম লিখুন',
  phoneNumber: 'মোবাইল নম্বর',
  phonePlaceholder: '+8801721415263',
  deliveryAddress: 'ডেলিভারি ঠিকানা',
  fullAddressPlaceholder: 'বাড়ি, রোড, এলাকা, জেলা — সম্পূর্ণ ঠিকানা লিখুন',
  continueToDelivery: 'ডেলিভারিতে এগিয়ে যান',
  fullNameRequired: 'পুরো নাম লিখুন',
  phoneRequired: 'মোবাইল নম্বর দিন',
  phoneInvalid: 'সঠিক মোবাইল নম্বর লিখুন',
  phoneInvalidBd: 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন 01712345678)',
  addressRequired: 'ডেলিভারি ঠিকানা লিখুন',
  addressTooShort: 'সম্পূর্ণ ঠিকানা লিখুন (বাড়ি, রোড, এলাকা, জেলা)',
  districtRequired: 'সঠিক কুরিয়ার চার্জ নির্ধারণের জন্য আপনার জেলা নির্বাচন করুন।',
  districtFeeHint: 'অনুগ্রহ করে পেছনে গিয়ে ঠিকানা ধাপে আপনার জেলা নির্বাচন করুন — কুরিয়ার চার্জ তার ওপর নির্ভর করে।',
  bdOnlyCaution: 'আমরা শুধু বাংলাদেশের ভেতরে ডেলিভারি করি। নিশ্চিত করুন আপনার ঠিকানা বাংলাদেশের — ভারত বা অন্য দেশের ঠিকানায় অর্ডার গ্রহণ করা যায় না।',
  deliveryHeading: 'ডেলিভারি পদ্ধতি',
  deliverySubtitle: 'আপনার পছন্দের ডেলিভারি নির্বাচন করুন।',
  recapAddress: 'ডেলিভারি হবে',
  recapDelivery: 'ডেলিভারি পদ্ধতি',
  homeDeliveryName: 'হোম ডেলিভারি — সারাদেশে কুরিয়ার',
  homeDeliveryDesc: 'বাংলাদেশের যেকোনো প্রান্তে আপনার দরজায় পৌঁছে যাবে।',
  courierEta: '৩–৪ দিন এর ভেতরে সর্বোচ্চ',
  pickupName: 'স্টোর পিকআপ',
  pickupDesc: 'আমাদের পিকআপ পয়েন্ট থেকে নিজে সংগ্রহ করে নিন।',
  pickupEta: 'কনফার্মের ২৪ ঘণ্টার মধ্যে রেডি — ডেলিভারি চার্জ নেই',
  deliveryCallNote: 'পার্সেল পাঠানোর আগে আমরা প্রতিটি অর্ডার একটি ছোট ফোন কলে কনফার্ম করি — ফোনে যোগাযোগযোগ্য থাকুন।',
  continueToPayment: 'পেমেন্টে এগিয়ে যান',
  paymentHeading: 'পেমেন্ট',
  payDeliveryNowTitle: 'ডেলিভারি চার্জ এখন, বাকিটা ডেলিভারিতে',
  payDeliveryNowDesc: 'এখন বিকাশে ৳{{advance}} পাঠান, পার্সেল হাতে পেয়ে বাকি ৳{{due}} ক্যাশে দিন।',
  payNothingNowDesc: 'এখন কিছু দিতে হবে না — পার্সেল হাতে পেয়ে ৳{{due}} ক্যাশে দিন।',
  payFullNowTitle: 'পুরো টাকা এখনই পরিশোধ করুন',
  payFullNowDesc: 'এখনই বিকাশে পুরো ৳{{total}} পাঠান — ডেলিভারিতে কিছুই দিতে হবে না।',
  fullAdvanceRequiredNote: '৳{{threshold}} বা তার বেশি মূল্যের অর্ডার সম্পূর্ণ অগ্রিমে দিতে হয়।',
  paymentInstructionsTitle: 'অগ্রিম টাকা পাঠানোর নিয়ম',
  sendMoneyInstruction: 'নিচের পার্সোনাল বিকাশ নম্বরে Send Money (Cash Out নয়) করে অগ্রিম টাকা পাঠান, তারপর আপনার বিকাশ নম্বর ও কনফার্মেশন এসএমএস-এর TrxID লিখুন।',
  bkashPersonalLabel: 'বিকাশ (পার্সোনাল)',
  advanceAmountLabel: 'এখন পাঠাবেন',
  dueOnDeliveryLabel: 'ডেলিভারিতে দেবেন',
  senderBkashLabel: 'আপনার বিকাশ নম্বর',
  senderBkashPlaceholder: 'যে নম্বর থেকে টাকা পাঠিয়েছেন',
  senderBkashHint: 'শুধু পেমেন্ট যাচাই করতে ব্যবহৃত হয় — কখনো শেয়ার করা হয় না।',
  codOnlyTitle: 'ক্যাশ অন ডেলিভারি — কোনো অগ্রিম নেই',
  codOnlyDesc: 'বিকাশে অগ্রিম লাগবে না — পার্সেল হাতে পেয়ে পুরো ৳{{total}} ক্যাশে দিন।',
  codNote: 'ডেলিভারি এজেন্ট আপনার দরজায় টাকা নিয়ে যাবেন।',
  codBadge: 'ক্যাশ অন ডেলিভারি',
  bkashNumberRequired: 'আপনার বিকাশ নম্বর লিখুন',
  bkashNumberInvalid: 'সঠিক বিকাশ নম্বর লিখুন',
  trxIdRequired: 'বিকাশ কনফার্মেশন এসএমএস-এর TrxID লিখুন',
  trxIdInvalid: 'বিকাশ কনফার্মেশন এসএমএস থেকে TrxID লিখুন',
  mustAgreeTerms: 'অর্ডার দিতে শর্তাবলি মেনে নিন',
  agreePrefix: 'আমি',
  agreeTermsLink: 'শর্তাবলি',
  agreeAnd: 'এবং',
  agreePrivacyLink: 'গোপনীয়তা নীতি',
  placeOrder: 'অর্ডার কনফার্ম করুন',
  placingOrder: 'অর্ডার হচ্ছে...',
  orderSummary: 'অর্ডার সামারি',
  productPrice: 'পণ্যের দাম',
  discount: 'ছাড়',
  deliveryFee: 'ডেলিভারি চার্জ',
  shippingRowLabel: 'শিপিং',
  subtotal: 'সাবটোটাল',
  totalToPay: 'মোট',
  couponCode: 'কুপন কোড',
  couponPlaceholder: 'কোড লিখুন',
  couponApply: 'প্রয়োগ',
  couponAppliedMsg: '{{code}} প্রয়োগ হয়েছে — আপনি ৳{{amount}} সাশ্রয় করেছেন',
  couponInvalid: 'এই কুপন কোডটি সঠিক নয়',
  couponExpired: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে',
  couponMinOrder: 'এই কুপনে ন্যূনতম ৳{{amount}} অর্ডার দরকার',
  couponProductsOnly: 'শুধু এগুলোর জন্য প্রযোজ্য: {{codes}}',
  couponRemove: 'কুপন সরান',
  copyShort: 'কপি',
  copiedShort: 'কপি হয়েছে!',
  orderPlaced: 'অর্ডার সফল হয়েছে!',
  orderPlacedSuffix: 'সফলভাবে সম্পন্ন',
  thankYou: 'ধন্যবাদ, {{name}}!',
  weWillContact: 'অর্ডার কনফার্ম করতে আমরা {{phone}} নম্বরে যোগাযোগ করব।',
  orderCodeLabel: 'আপনার অর্ডার কোড',
  orderCodeSaveNote: 'এই কোডটি সংরক্ষণ করুন — যেকোনো সময় "Track Order" পেজে ব্যবহার করুন।',
  cartEmpty: 'আপনার কার্ট খালি',
  infoSecure: 'আপনার তথ্য সুরক্ষিত',
  somethingWentWrong: 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',
  trustSecure: 'নিরাপদ চেকআউট',
  trustNationwide: 'সারা বাংলাদেশে ডেলিভারি',
  trustBkashCod: 'বিকাশ অগ্রিম বা ক্যাশ অন ডেলিভারি',
  deliveryAcrossBangladesh: 'সারা বাংলাদেশে ডেলিভারি',
  districtLabel: 'জেলা / জোন',
  districtPlaceholder: 'আপনার জেলা নির্বাচন করুন…',
  districtCountHint: '{{count}}টি জেলা কভার করা আছে — কুরিয়ার চার্জ আপনার জোন অনুযায়ী ধার্য হয়।',
  zoneInsideDhaka: 'ঢাকার ভেতরে',
  zoneDhakaSuburban: 'ঢাকা সাবআরবান',
  zoneOutsideDhaka: 'ঢাকার বাইরে',
  pickupPayTitle: 'আমাদের স্টোরে এসে, পণ্য হাতে নিয়ে সম্পূর্ণ টাকা পরিশোধ করুন',
  pickupPayDesc: 'আমাদের স্টোর থেকে পণ্য হাতে নেওয়ার সময় পুরো ৳{{amount}} ক্যাশে পরিশোধ করুন।',
};

// Single-language site: English everywhere except the checkout flow,
// which serves the `bn` map (see LanguageContext scopes).
export const translations: TranslationMap = en;
export const bnTranslations: TranslationMap = bn;

export type LanguageScope = 'default' | 'checkout';
