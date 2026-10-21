// ============================================================================
// Login screen — ElderCare
//
// Production-quality login flow supporting phone number or email address identity,
// password entry with secure show/hide toggle, client validation, accessible UI,
// and smooth handover to AuthContext.signIn() for role-based navigation.
// ============================================================================

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { login } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { API_URL } from '../config';
import { colors, spacing, type } from '../ui/theme';

export function LoginScreen({ navigation }) {
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const errs = {};
    if (!identifier.trim()) {
      errs.identifier = 'Please enter your email or phone number.';
    }
    if (!password) {
      errs.password = 'Please enter your password.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleLogin() {
    setError(null);
    setFieldErrors({});

    if (!validate()) {
      return;
    }

    setBusy(true);

    const startTime = Date.now();
    const value = identifier.trim();
    const isEmail = value.includes('@');
    console.log(`[ElderCare Login] >>> START login via ${isEmail ? 'email' : 'phone'} identity -> ${API_URL}/auth/login`);

    try {
      const payload = {
        ...(isEmail ? { email: value } : { phone: value }),
        password,
      };

      const response = await login(payload);
      const elapsed = Date.now() - startTime;
      console.log(`[ElderCare Login] <<< SUCCESS in ${elapsed}ms for role=${response?.user?.role}`);
      await signIn(response);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.log(`[ElderCare Login] <<< FAILED in ${elapsed}ms: name=${err.name}, code=${err.code}, status=${err.status}, msg=${err.message}`);

      if (err.name === 'NetworkError') {
        setError(err.message || `Unable to reach ${API_URL}. Check device connection.`);
      } else if (err.code === 'invalid_credentials') {
        setError('Invalid email/phone or password.');
      } else if (err.code === 'account_disabled') {
        setError('This account has been deactivated. Please contact support.');
      } else if (err.code === 'validation_failed' && Array.isArray(err.details)) {
        const mappedErrs = {};
        err.details.forEach((item) => {
          if (item.field === 'phone' || item.field === 'email') {
            mappedErrs.identifier = item.message;
          } else if (item.field) {
            mappedErrs[item.field] = item.message;
          }
        });
        setFieldErrors(mappedErrs);
        setError('Please check your input and try again.');
      } else if (err.status) {
        setError(`Server error (${err.status} / ${err.code || 'error'}): ${err.message || 'Request failed'}`);
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Branding Header */}
          <View style={styles.header}>
            <Text style={styles.title}>ElderCare</Text>
            <Text style={styles.subtitle}>Welcome back! Sign in to access your account.</Text>
            <Text style={styles.apiIndicatorHeader}>API: {API_URL}</Text>
          </View>

          {/* Global Error Banner */}
          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            {/* Phone or Email Identifier */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number or Email</Text>
              <TextInput
                style={[styles.input, fieldErrors.identifier ? styles.inputError : null]}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Enter mobile number or email"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Phone number or email address"
              />
              {fieldErrors.identifier ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.identifier}</Text>
              ) : null}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    fieldErrors.password ? styles.inputError : null,
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Password"
                />
                <Pressable
                  style={styles.toggleButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              {fieldErrors.password ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>
              ) : null}
            </View>

            {/* Sign In Main Button */}
            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                busy ? styles.submitButtonDisabled : null,
                pressed && !busy ? styles.submitButtonPressed : null,
              ]}
              onPress={handleLogin}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sign in to ElderCare"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Sign In</Text>
              )}
            </Pressable>
          </View>

          {/* Registration Navigation Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Pressable
              onPress={() => navigation.navigate('Register')}
              accessibilityRole="button"
              accessibilityLabel="Go to registration"
              hitSlop={12}
            >
              <Text style={styles.registerLink}> Register</Text>
            </Pressable>
          </View>

          {/* Active Backend Indicator */}
          <View style={styles.apiIndicator}>
            <Text style={styles.apiIndicatorText}>Backend: {API_URL}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: type.title + 6,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  apiIndicatorHeader: {
    fontSize: type.small,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.xs + 2,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    gap: spacing.md + 2,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: type.body,
    color: colors.text,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldErrorText: {
    color: colors.danger,
    fontSize: type.small,
    fontWeight: '500',
  },
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 70,
  },
  toggleButton: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  toggleText: {
    fontSize: type.body - 1,
    fontWeight: '600',
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    marginTop: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: type.body + 1,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl + 8,
  },
  footerText: {
    fontSize: type.body,
    color: colors.textMuted,
  },
  registerLink: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.primary,
  },
  apiIndicator: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.xs,
  },
  apiIndicatorText: {
    fontSize: type.small - 1,
    color: colors.textMuted,
  },
});
