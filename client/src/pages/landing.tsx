import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  cognitoSignIn, 
  cognitoSignUp, 
  cognitoSignInWithGoogle,
  handleCognitoCallback,
  getCognitoToken,
  initializeCognito,
  cognitoForgotPassword,
  cognitoConfirmResetPassword
} from "@/cognito";

export default function Landing() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isCheckingCallback, setIsCheckingCallback] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => setCooldownSeconds(cooldownSeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  useEffect(() => {
    initializeCognito();
    
    const checkOAuthCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hasCode = urlParams.has('code');
        const hasError = urlParams.has('error');
        
        // Handle OAuth error
        if (hasError) {
          const errorDesc = urlParams.get('error_description') || 'Authentication failed';
          console.error('❌ OAuth error:', errorDesc);
          toast({
            title: "Sign-In Failed",
            description: errorDesc,
            variant: "destructive",
          });
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsCheckingCallback(false);
          return;
        }
        
        if (hasCode) {
          console.log('🔐 [Google OAuth] Callback detected with authorization code, processing...');
          
          // Process the OAuth callback - this exchanges the code for tokens
          const user = await handleCognitoCallback();
          
          if (user) {
            console.log('✅ [Google OAuth] User authenticated:', user.email);
            
            localStorage.setItem('currentUserId', user.userId);
            localStorage.setItem('currentUserEmail', user.email);
            localStorage.setItem('currentUserName', user.name);
            
            const token = await getCognitoToken();
            if (token) {
              try {
                await fetch('/api/auth/cognito', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ name: user.name, email: user.email }),
                });
              } catch (err) {
                console.warn('Backend sync failed, continuing...', err);
              }
            }
            
            console.log('✅ [Google OAuth] Sign-in successful, redirecting to app...');
            // Clean up URL before redirect
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.href = '/';
            return;
          } else {
            console.error('❌ [Google OAuth] Failed to get user from callback');
            toast({
              title: "Sign-In Failed",
              description: "Could not complete Google sign-in. Please try again.",
              variant: "destructive",
            });
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch (error: any) {
        console.error('❌ [Google OAuth] Callback error:', error);
        toast({
          title: "Sign-In Error",
          description: error.message || "An unexpected error occurred during sign-in.",
          variant: "destructive",
        });
        // Clean up URL on error
        window.history.replaceState({}, document.title, window.location.pathname);
      } finally {
        setIsCheckingCallback(false);
      }
    };
    
    checkOAuthCallback();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      console.log('🔐 Initiating Google OAuth via AWS Cognito...');
      await cognitoSignInWithGoogle();
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      
      if (error.message?.includes('not configured')) {
        toast({
          title: "Configuration Error",
          description: "Google Sign-In is not configured. Please set up AWS Cognito with Google federation.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign-In Error",
          description: error.message || "An unexpected error occurred during Google sign-in.",
          variant: "destructive",
        });
      }
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!isLogin && !name) {
      toast({
        title: "Missing Information",
        description: "Please enter your name to create an account.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !password) {
      toast({
        title: "Missing Information",
        description: "Please enter email and password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailLoading(true);
    try {
      let user;
      
      if (isLogin) {
        console.log('🔐 Signing in with AWS Cognito...');
        user = await cognitoSignIn(email, password);
      } else {
        console.log('🔐 Signing up with AWS Cognito...');
        await cognitoSignUp(email, password, name);
        
        // Auto-confirm the user via backend API
        console.log('🔐 Auto-confirming user...');
        try {
          await fetch('/api/auth/cognito/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
        } catch (confirmError) {
          console.warn('⚠️ Auto-confirm failed, user may already be confirmed:', confirmError);
        }
        
        console.log('🔐 Auto-signing in after signup...');
        user = await cognitoSignIn(email, password);
        
        toast({
          title: "Account Created",
          description: "Welcome! Your account has been created successfully.",
        });
      }

      localStorage.setItem('currentUserId', user.userId);
      localStorage.setItem('currentUserEmail', user.email);
      localStorage.setItem('currentUserName', user.name);

      console.log('🔑 Authentication successful:', { 
        action: isLogin ? 'login' : 'register',
        userId: user.userId,
        email: user.email 
      });

      const token = await getCognitoToken();
      if (token) {
        try {
          await fetch('/api/auth/cognito', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: user.name, email: user.email }),
            signal: AbortSignal.timeout(8000)
          });
        } catch (fetchError) {
          console.warn('⚠️ Backend sync failed, but Cognito Auth succeeded. Continuing...', fetchError);
        }
      }

      console.log('✅ Authentication successful, redirecting to app...');
      window.location.href = "/";
    } catch (error: any) {
      console.error('❌ Authentication error:', error);
      
      let errorMessage = error.message || "Something went wrong. Please try again.";
      
      if (error.name === 'UserNotConfirmedException') {
        errorMessage = "Please verify your email before signing in. Check your inbox for a verification link.";
      } else if (error.name === 'NotAuthorizedException') {
        errorMessage = "Incorrect email or password.";
      } else if (error.name === 'UserNotFoundException') {
        errorMessage = "No account found with this email. Please sign up first.";
      } else if (error.name === 'UsernameExistsException') {
        errorMessage = "An account with this email already exists.";
      } else if (error.name === 'InvalidPasswordException') {
        errorMessage = "Password does not meet requirements. Use at least 8 characters with uppercase, lowercase, numbers, and symbols.";
      }
      
      toast({
        title: "Authentication Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email) {
      toast({
        title: "Missing Email",
        description: "Enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (cooldownSeconds > 0) {
      toast({
        title: "Please Wait",
        description: `Rate limit active. Try again in ${cooldownSeconds} seconds.`,
        variant: "destructive",
      });
      return;
    }

    setIsSendingOtp(true);
    try {
      console.log('📧 Sending forgot password request via backend...');
      
      // Use backend endpoint that auto-verifies email before sending OTP
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw { name: result.code || 'Error', message: result.message };
      }
      
      console.log('✅ OTP sent successfully!');
      setIsOtpSent(true);
      
      toast({
        title: "Code Sent Successfully",
        description: "Verification code sent to your email.",
      });
    } catch (error: any) {
      console.error('❌ Forgot Password Error:', error.name, error.message);
      let msg = error.message || "Failed to send code.";
      let title = "Error";
      
      if (error.name === 'UserNotFoundException') {
        msg = "This email is not registered. Please sign up first.";
        title = "User Not Found";
      } else if (error.name === 'LimitExceededException') {
        msg = "Rate limit exceeded. Please wait before trying again.";
        title = "Rate Limited";
        setCooldownSeconds(300); // 5 minute cooldown
      }
      
      toast({
        title: title,
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSaveNewPassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Missing Password",
        description: "Enter new password.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Mismatch",
        description: "Passwords don't match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Too Short",
        description: "Use 8+ characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      console.log('🔐 AWS confirmResetPassword:', email, otp.length, 'chars');
      await cognitoConfirmResetPassword(email, otp, newPassword);
      
      toast({
        title: "Success",
        description: "Password reset. Login now.",
      });
      
      setIsForgotPassword(false);
      setIsOtpSent(false);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setEmail("");
      setIsLogin(true);
    } catch (error: any) {
      console.error('❌ Error:', error.name, error.message);
      let msg = "Reset failed.";
      
      if (error.name === 'CodeMismatchException') {
        msg = "Wrong verification code. Please check and try again.";
      } else if (error.name === 'ExpiredCodeException') {
        msg = "Code expired. Request new one.";
        setIsOtpSent(false);
        setOtp("");
      } else if (error.name === 'InvalidPasswordException') {
        msg = "Password needs: uppercase, lowercase, numbers, symbols.";
      } else if (error.name === 'LimitExceededException') {
        msg = "Too many attempts. Wait 5-10 min.";
      }
      
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleBackToLogin = () => {
    setIsForgotPassword(false);
    setIsOtpSent(false);
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  if (isCheckingCallback) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-white text-lg">Processing authentication...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-8">
      <div className="text-center mb-12">
        <h1 className="text-7xl md:text-8xl font-bold text-white tracking-tight">PERALA</h1>
      </div>
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Get Early Access</h2>
          <p className="text-gray-400 text-lg mb-2">Type a prompt, get a trading strategy</p>
          <p className="text-gray-400 text-lg mb-6">instantly.</p>
          <p className="text-gray-500 text-sm">AI-powered trading insights.</p>
        </div>
        <div className="w-full max-w-md mx-auto space-y-4">
          {isForgotPassword ? (
            <>
              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-white mb-2">Reset Password</h3>
                <p className="text-gray-400 text-sm">Enter your email to receive a verification code</p>
              </div>
              <div className="space-y-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isOtpSent}
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg disabled:opacity-50"
                  data-testid="input-forgot-email"
                />
                {cooldownSeconds > 0 && (
                  <div className="p-3 bg-orange-900/30 border border-orange-700 rounded-lg text-center">
                    <p className="text-orange-400 text-sm">
                      AWS rate limit active. Wait {Math.floor(cooldownSeconds / 60)}:{(cooldownSeconds % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
                {!isOtpSent ? (
                  <Button
                    onClick={handleSendOtp}
                    disabled={isSendingOtp || cooldownSeconds > 0}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium h-12 rounded-lg disabled:opacity-50"
                    data-testid="button-send-otp"
                  >
                    {isSendingOtp ? "Sending..." : cooldownSeconds > 0 ? `Wait ${Math.floor(cooldownSeconds / 60)}:${(cooldownSeconds % 60).toString().padStart(2, '0')}` : "Send OTP"}
                    {!isSendingOtp && cooldownSeconds === 0 && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                ) : (
                  <>
                    <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-center">
                      <p className="text-green-400 text-sm">Verification code sent to your email</p>
                    </div>
                    <Input
                      type="text"
                      placeholder="Enter 6-digit verification code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg text-center text-lg tracking-widest"
                      data-testid="input-otp"
                    />
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="New Password (8+ characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg pr-12"
                        data-testid="input-new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                        data-testid="button-toggle-new-password-visibility"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm New Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg pr-12"
                        data-testid="input-confirm-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                        data-testid="button-toggle-confirm-password-visibility"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      onClick={handleSaveNewPassword}
                      disabled={otp.length < 6 || !newPassword || !confirmPassword || isSavingPassword}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium h-12 rounded-lg disabled:opacity-50"
                      data-testid="button-save-password"
                    >
                      {isSavingPassword ? "Resetting Password..." : "Reset Password"}
                      {!isSavingPassword && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || cooldownSeconds > 0}
                      className="w-full text-gray-400 hover:text-white disabled:opacity-50"
                      data-testid="button-resend-otp"
                    >
                      {isSendingOtp ? "Sending..." : cooldownSeconds > 0 ? `Wait ${Math.floor(cooldownSeconds / 60)}:${(cooldownSeconds % 60).toString().padStart(2, '0')}` : "Resend Code"}
                    </Button>
                  </>
                )}
                <div className="flex justify-center">
                  <button
                    onClick={handleBackToLogin}
                    className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
                    data-testid="button-back-to-login"
                  >
                    Back to Login
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 p-1 bg-gray-800 rounded-lg">
                <Button
                  variant="ghost"
                  className={`flex-1 ${isLogin ? "bg-gray-700 text-white" : "text-gray-400"}`}
                  onClick={() => setIsLogin(true)}
                  data-testid="button-toggle-login"
                >
                  Login
                </Button>
                <Button
                  variant="ghost"
                  className={`flex-1 ${!isLogin ? "bg-gray-700 text-white" : "text-gray-400"}`}
                  onClick={() => setIsLogin(false)}
                  data-testid="button-toggle-signup"
                >
                  Sign Up
                </Button>
              </div>
              <div className="space-y-3">
                {!isLogin && (
                  <Input
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg"
                    data-testid="input-name"
                  />
                )}
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg"
                  data-testid="input-email"
                />
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleEmailAuth()}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 h-12 rounded-lg pr-12"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                    data-testid="button-toggle-password-visibility"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <Button
                  onClick={handleEmailAuth}
                  disabled={isEmailLoading || isGoogleLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium h-12 rounded-lg"
                  data-testid="button-email-auth"
                >
                  {isEmailLoading ? "Processing..." : isLogin ? "Login" : "Create Account"}
                  {!isEmailLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                {isLogin && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setIsForgotPassword(true)}
                      className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                      data-testid="button-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col items-center space-y-3 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
            <span>AI Social feed </span>
          </div>
         
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
            <span>AI-Journal tracking</span>
          </div>
        </div>
      </div>
    </div>
  );
}
