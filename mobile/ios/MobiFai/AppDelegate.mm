#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  // Configure Metro bundler to use Mac IP address for physical device
  // Use a fixed IP address instead of relying on RCTBundleURLProvider's auto-detection
  NSString *hostname = @"192.168.1.7";
  NSNumber *port = @8081;
  NSString *path = @".expo/.virtual-metro-entry";
  
  // Construct the bundle URL directly
  NSString *urlString = [NSString stringWithFormat:@"http://%@:%@/%@.bundle?platform=ios&dev=true&minify=false&hot=false", hostname, port, path];
  NSURL *bundleURL = [NSURL URLWithString:urlString];
  
  // Fallback to default if URL construction fails
  if (!bundleURL) {
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    NSURL *defaultURL = [settings jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
    NSString *defaultString = [defaultURL absoluteString];
    defaultString = [defaultString stringByReplacingOccurrencesOfString:@"localhost" withString:hostname];
    defaultString = [defaultString stringByReplacingOccurrencesOfString:@"127.0.0.1" withString:hostname];
    defaultString = [defaultString stringByReplacingOccurrencesOfString:@"::1" withString:hostname];
    bundleURL = [NSURL URLWithString:defaultString];
  }
  
  return bundleURL ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

@end
