declare module "react-native-razorpay" {
  const checkout: {
    open: (options: Record<string, any>) => Promise<Record<string, any>>;
  };
  export default checkout;
}
