"use client"

import { requestPasswordReset } from "@/server/actions"
import { RequestPasswordResetSchema } from "@/utils/validation"
import { getFormProps, getInputProps, useForm } from "@conform-to/react"
import { parseWithZod } from "@conform-to/zod"
import { useFormState } from "react-dom"

export default function ResetPasswordForm() {
  const [lastResult, action] = useFormState(requestPasswordReset, undefined)
  const [form, fields] = useForm({
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: RequestPasswordResetSchema })
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  })

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <div>
        <label
          htmlFor={fields.email.id}
          className="block font-medium text-gray-900 text-sm leading-6"
        >
          Email address
        </label>
        <div className="mt-2">
          <input
            {...getInputProps(fields.email, { type: "email" })}
            autoComplete="email"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm sm:leading-6"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-sm text-white leading-6 shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
        >
          Sign in
        </button>
      </div>
    </form>
  )
}