"use server"

import {
  invalidateAllSessions,
  invalidateSession,
  setSession,
  validateRequest,
} from "@/lib/auth"
import {
  AUTHORIZED_URL,
  FALLBACK_IP,
  RESET_PASSWORD_URL,
  UNAUTHORIZED_URL,
} from "@/lib/consts"
import rateLimit from "@/lib/rate-limit"
import { isProduction } from "@/lib/vars"
import {
  createPassword,
  createUser,
  createUserFromCode,
  findPasswordResetToken,
  findUserByEmail,
  markPasswordResetTokenAsUsed,
  sendPasswordResetToken,
  sendSignInCode,
  verifyEmailVerificationCode,
  verifyPassword,
  verifySignInCode,
} from "@/server/data"
import { PasswordResetError } from "@/utils/error"
import { getIpAddress } from "@/utils/headers"
import {
  CheckEmailVerificationCodeSchema,
  CheckSignInCodeSchema,
  NewPasswordSchema,
  RequestPasswordResetSchema,
  SignInWithCodeSchema,
  SignInWithPasswordSchema,
  SignUpSchema,
} from "@/utils/validation"
import { parseWithZod } from "@conform-to/zod"
import { cookies } from "next/headers"
import { RedirectType, redirect } from "next/navigation"

const VERIFICATION_EMAIL_COOKIE_NAME = "verification-email"

export async function signUp(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: SignUpSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const ipAddress = getIpAddress() ?? FALLBACK_IP

  const { success } = await rateLimit.unknown.limit(ipAddress)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const existingUser = await findUserByEmail(submission.value.email)

  if (existingUser) {
    return submission.reply({
      formErrors: ["There's already an account with this email"],
    })
  }

  const newUser = await createUser({
    email: submission.value.email,
  })

  await createPassword(newUser.id, submission.value.password)

  await setSession(newUser.id, { ipAddress })

  redirect(AUTHORIZED_URL)
}

export async function signInWithPassword(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: SignInWithPasswordSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const ipAddress = getIpAddress() ?? FALLBACK_IP

  const { success } = await rateLimit.unknown.limit(ipAddress)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const existingUser = await findUserByEmail(submission.value.email)

  if (!existingUser) {
    return submission.reply({
      formErrors: ["Incorrect email or password"],
    })
  }

  const isValidPassword = await verifyPassword(
    existingUser.id,
    submission.value.password,
  )

  if (!isValidPassword) {
    return submission.reply({
      formErrors: ["Incorrect email or password"],
    })
  }

  await setSession(existingUser.id, { ipAddress })

  redirect(AUTHORIZED_URL)
}

export async function signInWithCode(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: SignInWithCodeSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const { success } = await rateLimit.unknown.limit(submission.value.email)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  await sendSignInCode(submission.value.email)

  cookies().set(VERIFICATION_EMAIL_COOKIE_NAME, submission.value.email, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 60 * 10, // Ten minutes
    path: "/sign-in/code",
  })

  redirect("/sign-in/code")
}

export async function checkSignInCode(_: unknown, formData: FormData) {
  const email = cookies().get(VERIFICATION_EMAIL_COOKIE_NAME)?.value ?? null

  if (!email) {
    return redirect(UNAUTHORIZED_URL)
  }

  const submission = parseWithZod(formData, {
    schema: CheckSignInCodeSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const ipAddress = getIpAddress() ?? FALLBACK_IP

  const { success } = await rateLimit.unknown.limit(ipAddress)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const isValidCode = await verifySignInCode(email, submission.value.code)

  if (!isValidCode) {
    return submission.reply({
      formErrors: ["Invalid code"],
    })
  }

  cookies().delete(VERIFICATION_EMAIL_COOKIE_NAME)

  // If the user already exists, we just update their emailVerifiedAt
  const user = await createUserFromCode({ email })

  await setSession(user.id, { ipAddress })

  redirect(AUTHORIZED_URL)
}

export async function checkEmailVerificationCode(
  _: unknown,
  formData: FormData,
) {
  const { user } = await validateRequest()

  if (!user) {
    return redirect(UNAUTHORIZED_URL)
  }

  const submission = parseWithZod(formData, {
    schema: CheckEmailVerificationCodeSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const { success } = await rateLimit.user.limit(user.email)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const isValidCode = await verifyEmailVerificationCode(
    user.id,
    submission.value.code,
  )

  if (!isValidCode) {
    return submission.reply({
      formErrors: ["Invalid code"],
    })
  }

  await redirect(AUTHORIZED_URL)
}

export async function requestPasswordReset(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: RequestPasswordResetSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const ipAddress = getIpAddress() ?? FALLBACK_IP

  const { success } = await rateLimit.unknown.limit(ipAddress)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const existingUser = await findUserByEmail(submission.value.email)

  if (existingUser) {
    await sendPasswordResetToken(existingUser)
  }

  redirect(`${RESET_PASSWORD_URL}/confirm?to=${submission.value.email}`)
}

export async function resetPassword(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: NewPasswordSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const ipAddress = getIpAddress() ?? FALLBACK_IP

  const { success } = await rateLimit.unknown.limit(ipAddress)

  if (!success) {
    return submission.reply({
      formErrors: ["Too many requests"],
    })
  }

  const passwordResetToken = await findPasswordResetToken(
    submission.value.token,
  )

  if (!passwordResetToken) {
    throw new PasswordResetError("Your token has expired or is invalid")
  }

  // Log the user out of all sessions
  await invalidateAllSessions(passwordResetToken.userId)

  await createPassword(passwordResetToken.userId, submission.value.password)
  await markPasswordResetTokenAsUsed(passwordResetToken)

  await setSession(passwordResetToken.userId, { ipAddress })

  redirect(AUTHORIZED_URL, RedirectType.replace)
}

export async function signOut() {
  const { session } = await validateRequest()

  if (!session) {
    return redirect(UNAUTHORIZED_URL)
  }

  await invalidateSession(session)

  redirect(UNAUTHORIZED_URL)
}
