export type Language = 'en' | 'bn';

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
  | 'addressRequired'
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
  | 'backToProduct';

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
  addressRequired: 'Delivery address is required',
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
};

const bn: TranslationMap = {
  brandName: 'Ornix',
  home: 'হোম',
  shop: 'পণ্য',
  feedback: 'ফিডব্যাক',
  madeInBangladesh: 'বাংলাদেশে তৈরি',
  wearYourStory: 'ফ্যাশনে আসুক আভিজাত্য, পোশাকে প্রকাশ পাক আপনার গল্প।',
  premiumFashion:
    'বাংলাদেশে তৈরি প্রিমিয়াম ফ্যাশন ব্র্যান্ড এখন আপনার হাতের মুঠোয়। আমরা বিশ্বাস করি ফ্যাশন মানে শুধু পোশাক নয়, ফ্যাশন হলো আপনার ব্যক্তিত্বের প্রকাশ।',
  shopCollection: 'কালেকশন',
  explore: 'ব্রাউজ করুন',
  freeDelivery: '৳১০০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
  qualityGuaranteed: 'মান নিশ্চয়তা',
  bkashPayment: 'bKash পেমেন্ট',
  allProducts: 'সব পণ্য',
  itemsCountOne: '১ টি পণ্য',
  itemsCountMany: '{{count}} টি পণ্য',
  searchPlaceholder: 'পণ্যের নাম বা কোড দিয়ে সন্ধান করুন...',
  all: 'সব',
  noProductsFound: 'কোন পণ্য পাওয়া যায়নি',
  noProductsMatchSearch: 'আপনার অনুসন্ধানে কোন পণ্য মেলে না। ভিন্ন কীওয়ার্ড ব্যবহার করুন।',
  noProductsInCategory: 'এই ক্যাটাগরিতে এখনও কোন পণ্য নেই।',
  checkBackSoon: 'শীঘ্রই নতুন আগমনের জন্য আবার দেখুন।',
  viewAllProducts: 'সব পণ্য দেখুন',
  productNotFound: 'পণ্য পাওয়া যায়নি।',
  backToHome: 'হোমে ফিরে যান',
  selectSize: 'সাইজ নির্বাচন করুন',
  onlyLeft: 'শুধুমাত্র {{count}} টি বাকি!',
  inStock: '{{count}} টি স্টকে আছে',
  outOfStock: 'স্টকে নেই',
  description: 'বর্ণনা',
  deliveryAcrossBangladesh: 'সারা বাংলাদেশে ডেলিভারি',
  qualityAssured: 'গুণগত মান নিশ্চিত',
  buyNowPrice: 'এখন কিনুন — ৳{{price}}',
  checkout: 'চেকআউট',
  completeYourOrder: 'আপনি এর অর্ডার সম্পূর্ণ করুন',
  orderSummary: 'অর্ডার সারসংক্ষেপ',
  productPrice: 'পণ্যের মূল্য',
  discount: 'ডিসকাউন্ট',
  deliveryFee: 'ডেলিভারি ফি',
  totalToPay: 'মোট পরিশোধ',
  yourDetails: 'আপনার বিবরণ',
  fullName: 'পুরো নাম',
  phoneNumber: 'ফোন নম্বর',
  deliveryAddress: 'ডেলিভারির ঠিকানা',
  bkashPaymentHeading: 'bKash পেমেন্ট',
  bkashPaymentInstruction:
    'অনুগ্রহ করে আগাম Tk 150 আমাদের bKash পার্সোনাল নম্বরে {{bkashNumber}} পাঠিয়ে, নিচে আপনার bKash নম্বর এবং TrxID (ট্রানজেকশন আইডি) লিখে অর্ডার নিশ্চিত করুন।',
  yourBkashNumber: 'আপনার bKash নম্বর',
  transactionId: 'ট্রানজেকশন আইডি (TrxID)',
  placingOrder: 'অর্ডার করা হচ্ছে...',
  confirmOrder: 'অর্ডার নিশ্চিত করুন',
  infoSecure: 'আপনার তথ্য নিরাপদ',
  orderPlaced: 'অর্ডার সফল হয়েছে!',
  thankYou: 'ধন্যবাদ, {{name}}!',
  weWillContact: 'আপনার অর্ডার নিশ্চিত করতে আমরা {{phone}}-এ যোগাযোগ করব।',
  continueShopping: 'কেনাকাটা চালিয়ে যান',
  messageSent: 'বার্তা প্রেরিত!',
  feedbackReceived: 'আমরা আপনার ফিডব্যাক পেয়েছি এবং শীঘ্রই আপনাকে জানাব।',
  backToProduct: 'পণ্যের কাছে ফিরে যান',
  admin: 'অ্যাডমিন',
  fullNameRequired: 'পুরো নাম প্রয়োজন',
  phoneRequired: 'ফোন নম্বর প্রয়োজন',
  phoneInvalid: 'একটি বৈধ ফোন নম্বর লিখুন',
  addressRequired: 'ডেলিভারির ঠিকানা প্রয়োজন',
  bkashNumberRequired: 'আপনার bKash নম্বর প্রয়োজন',
  bkashNumberInvalid: 'একটি বৈধ bKash নম্বর লিখুন',
  trxIdRequired: 'ট্রানজেকশন আইডি প্রয়োজন',
  sendUsFeedback: 'ফিডব্যাক পাঠান',
  feedbackSubtitle: 'কোন প্রশ্ন, পরামর্শ বা অভিযোগ আছে? আপনার মতামত আমরা শুনতে চাই।',
  yourName: 'আপনার নাম',
  email: 'ই-মেইল',
  message: 'বার্তা',
  writeYourMessageHere: 'এখানে আপনার বার্তা লিখুন...',
  securityCheck: 'সিকিউরিটি চেক',
  newCaptcha: 'নতুন ক্যাপচা',
  sendFeedback: 'ফিডব্যাক পাঠান',
  sending: 'পাঠানো হচ্ছে...',
  backToStore: 'দোকানে ফিরে যান',
  nameRequired: 'আপনার নাম আবশ্যক',
  emailRequired: 'ই-মেইল আবশ্যক',
  enterValidEmail: 'সঠিক ই-মেইল লিখুন',
  messageRequired: 'অনুগ্রহ করে বার্তা লিখুন',
  messageTooShort: 'বার্তা খুব ছোট',
  captchaRequired: 'অনুগ্রহ করে ক্যাপচা সমাধান করুন',
  wrongCaptcha: 'ভুল উত্তর, আবার চেষ্টা করুন',
  somethingWentWrong: 'কোথাও ত্রুটি হয়েছে। আবার চেষ্টা করুন।',
  productPageDescriptionTitle: 'বর্ণনা',
  deliveryAcrossBd: 'সারা বাংলাদেশে ডেলিভারি',
  qualityAssuredShort: 'গুণগত মান নিশ্চিত',
  homeBreadcrumb: 'হোম',
  addToCart: 'এখন কিনুন — ৳{{price}}',
};

export const translations: Record<Language, TranslationMap> = {
  en,
  bn,
};

export const supportedLanguages: Record<Language, string> = {
  en: 'English',
  bn: 'বাংলা',
};
