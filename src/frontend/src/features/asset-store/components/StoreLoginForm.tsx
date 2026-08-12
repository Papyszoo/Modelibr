import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { useForm } from 'react-hook-form'
import { type z } from 'zod'

import { storeLoginFormSchema } from '@/shared/validation/formSchemas'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { loginToStoreSession } from '../lib/session'

type StoreLoginFormValues = z.infer<typeof storeLoginFormSchema>

/**
 * Quiet, compact store sign-in. Credentials go straight to the STORE origin;
 * they never touch the local backend. Tokens stay in memory — signing in
 * again after an app restart is expected.
 */
export function StoreLoginForm() {
  const status = useAssetStoreAuthStore(state => state.status)
  const error = useAssetStoreAuthStore(state => state.error)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StoreLoginFormValues>({
    resolver: zodResolver(storeLoginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async values => {
    await loginToStoreSession(values.email, values.password)
  })

  const isLoggingIn = status === 'loggingIn'

  return (
    <form
      className="asset-store-login"
      onSubmit={onSubmit}
      data-testid="asset-store-login"
    >
      <p className="asset-store-login-hint">
        Sign in with your store account to see your library and import packs.
      </p>

      <label className="asset-store-login-field">
        <span>Email</span>
        <InputText
          type="email"
          autoComplete="email"
          disabled={isLoggingIn}
          data-testid="asset-store-email"
          {...register('email')}
        />
        {errors.email && (
          <small className="asset-store-login-error">
            {errors.email.message}
          </small>
        )}
      </label>

      <label className="asset-store-login-field">
        <span>Password</span>
        <InputText
          type="password"
          autoComplete="current-password"
          disabled={isLoggingIn}
          data-testid="asset-store-password"
          {...register('password')}
        />
        {errors.password && (
          <small className="asset-store-login-error">
            {errors.password.message}
          </small>
        )}
      </label>

      {error && (
        <small
          className="asset-store-login-error"
          data-testid="asset-store-login-error"
        >
          {error}
        </small>
      )}

      <Button
        type="submit"
        label={isLoggingIn ? 'Signing in…' : 'Sign in'}
        size="small"
        loading={isLoggingIn}
        data-testid="asset-store-login-submit"
      />
    </form>
  )
}
