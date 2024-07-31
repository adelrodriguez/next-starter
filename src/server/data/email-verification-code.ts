"server-only"

import { EmailVerificationCodeEmail } from "@/components/emails"
import { sendEmail } from "@/lib/emails"
import {
  type User,
  batch,
  deleteEmailVerificationCode,
  insertEmailVerificationCode,
  selectEmailVerificationCode,
  updateUser,
} from "@/server/db"
import { hash, verify } from "@/utils/hash"
import { TimeSpan, createDate } from "oslo"
import { alphabet, generateRandomString } from "oslo/crypto"

export async function sendEmailVerificationCode(user: User) {
  // Delete old codes
  await deleteEmailVerificationCode({ userId: user.id })

  const code = await generateRandomString(6, alphabet("0-9", "A-Z"))

  await insertEmailVerificationCode({
    userId: user.id,
    hash: await hash(code),
    expiresAt: createDate(new TimeSpan(24, "h")),
  })

  await sendEmail(
    user.email,
    "Verify email",
    EmailVerificationCodeEmail({ code }),
  )
}

export async function verifyEmailVerificationCode(
  userId: User["id"],
  code: string,
) {
  const emailVerificationCode = await selectEmailVerificationCode({ userId })

  if (!emailVerificationCode) return false

  const isValidCode = await verify(emailVerificationCode.hash, code)

  if (!isValidCode) return false

  await batch([
    updateUser(userId, { emailVerifiedAt: new Date() }),
    deleteEmailVerificationCode({ userId }),
  ])

  return true
}
