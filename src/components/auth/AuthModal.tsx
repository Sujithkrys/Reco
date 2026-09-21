import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, SpinnerGap } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

type AuthModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
	const [mode, setMode] = useState<"signin" | "signup">("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		
		if (mode === "signup" && password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		setLoading(true);

		try {
			if (mode === "signup") {
				const { error } = await supabase.auth.signUp({
					email,
					password,
				});
				if (error) throw error;
				// Supabase sets the session automatically if email confirmations are disabled (which they are for this MVP).
				// If successful, onAuthStateChange in AuthProvider will pick it up and close this modal.
			} else {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
			}
		} catch (err: unknown) {
			console.error("Auth error:", err);
			// Translate common supabase errors
			let msg = err.message || "An unexpected error occurred.";
			if (msg.includes("Invalid login credentials")) {
				msg = "Wrong email or password.";
			} else if (msg.includes("already registered")) {
				msg = "An account with this email already exists.";
			} else if (msg.includes("Password should be at least")) {
				msg = "Password must be at least 6 characters.";
			} else if (msg.includes("Unable to validate email")) {
				msg = "Please enter a valid email address.";
			}
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] p-[1px] rounded-[10px] bg-gradient-to-b from-white/10 to-transparent shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] focus:outline-none">
					<div className="w-full rounded-[9px] bg-editor-dialog p-6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
						<Dialog.Title className="text-xl font-medium tracking-tight">
							{mode === "signin" ? "Sign in to Reco" : "Create your account"}
						</Dialog.Title>
						<Dialog.Description className="mt-1.5 text-sm text-foreground/60">
							{mode === "signin"
								? "Welcome back! Please enter your details."
								: "Sign up to start saving and exporting your projects."}
						</Dialog.Description>

						<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-[13px] font-medium text-foreground/80">Email</label>
								<input
									type="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="hello@example.com"
									className="flex h-10 w-full rounded-lg border border-foreground/10 bg-black/20 px-3 py-2 text-sm text-foreground shadow-inner transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-[13px] font-medium text-foreground/80">Password</label>
								<input
									type="password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className="flex h-10 w-full rounded-lg border border-foreground/10 bg-black/20 px-3 py-2 text-sm text-foreground shadow-inner transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
								/>
							</div>

							{mode === "signup" && (
								<div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
									<label className="text-[13px] font-medium text-foreground/80">Confirm Password</label>
									<input
										type="password"
										required
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="••••••••"
										className="flex h-10 w-full rounded-lg border border-foreground/10 bg-black/20 px-3 py-2 text-sm text-foreground shadow-inner transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
									/>
								</div>
							)}

							{error && (
								<div className="rounded-md bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
									{error}
								</div>
							)}

							<button
								type="submit"
								disabled={loading}
								className="mt-2 inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
							>
								{loading ? (
									<SpinnerGap className="h-4 w-4 animate-spin" />
								) : mode === "signin" ? (
									"Sign In"
								) : (
									"Sign Up"
								)}
							</button>

							<div className="mt-2 text-center text-sm text-foreground/60">
								{mode === "signin" ? "Don't have an account? " : "Already have an account? "}
								<button
									type="button"
									onClick={() => {
										setMode(mode === "signin" ? "signup" : "signin");
										setError(null);
									}}
									className="font-medium text-primary hover:underline focus:outline-none"
								>
									{mode === "signin" ? "Sign up" : "Sign in"}
								</button>
							</div>
						</form>

						<Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
							<X className="h-4 w-4" />
							<span className="sr-only">Close</span>
						</Dialog.Close>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
