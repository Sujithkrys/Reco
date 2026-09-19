import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AuthModal } from "@/components/auth/AuthModal";

type AuthContextType = {
	user: User | null;
	session: Session | null;
	loading: boolean;
	signOut: () => Promise<void>;
	requireAuth: (action: () => void) => void;
	openAuthModal: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	
	const [isModalOpen, setIsModalOpen] = useState(false);
	const pendingActionRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		// Get initial session
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			setUser(session?.user ?? null);
			setLoading(false);
		});

		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session);
			setUser(session?.user ?? null);
			setLoading(false);
			
			// If we just signed in and there's a pending action, execute it!
			if (session?.user && pendingActionRef.current) {
				const action = pendingActionRef.current;
				pendingActionRef.current = null;
				setIsModalOpen(false); // Close modal automatically
				// Execute on next tick to ensure state settles
				setTimeout(action, 10);
			}
		});

		return () => subscription.unsubscribe();
	}, []);

	const signOut = async () => {
		await supabase.auth.signOut();
	};

	const requireAuth = (action: () => void) => {
		if (user) {
			action();
		} else {
			pendingActionRef.current = action;
			setIsModalOpen(true);
		}
	};
	
	const openAuthModal = () => {
		pendingActionRef.current = null;
		setIsModalOpen(true);
	};

	const handleModalOpenChange = (open: boolean) => {
		setIsModalOpen(open);
		if (!open) {
			pendingActionRef.current = null;
		}
	};

	return (
		<AuthContext.Provider value={{ user, session, loading, signOut, requireAuth, openAuthModal }}>
			{children}
			<AuthModal open={isModalOpen} onOpenChange={handleModalOpenChange} />
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
