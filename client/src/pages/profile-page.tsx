import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Redirect } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get the user's profile data
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["/api/profile"],
    queryFn: async () => {
      console.log("Fetching profile data...");
      try {
        const res = await apiRequest("GET", "/api/profile");
        const profileData = await res.json();
        console.log("Profile data received:", profileData);
        return profileData;
      } catch (error) {
        console.error("Error fetching profile:", error);
        throw error;
      }
    },
    enabled: !!user,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Set up form for editing user profile
  const form = useForm({
    resolver: zodResolver(
      insertUserSchema
        .partial()
        .omit({ password: true, username: true }) // Cannot change username
    ),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      birthYear: undefined,
      birthMonth: undefined,
      birthDay: undefined,
    },
  });

  // Update form values when profile data is loaded
  useEffect(() => {
    if (profile) {
      form.reset({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        email: profile.email || "",
        phone: profile.phone || "",
        birthYear: profile.birthYear,
        birthMonth: profile.birthMonth,
        birthDay: profile.birthDay,
      });
    }
  }, [profile, form]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log('Updating profile with data:', data);
      setIsSubmitting(true);
      try {
        const res = await apiRequest("PATCH", "/api/profile", data);
        const responseData = await res.json();
        console.log('Profile update response:', responseData);
        return responseData;
      } catch (error) {
        console.error('Profile update error:', error);
        throw error;
      }
    },
    onSuccess: (updatedProfile) => {
      console.log('Profile updated successfully:', updatedProfile);
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error('Profile update mutation error:', error);
      setIsSubmitting(false);
      toast({
        title: "Update failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Toggle autoup mutation
  const toggleAutoupMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      console.log(`Updating autoup preference to: ${enabled}`);
      try {
        const res = await apiRequest("POST", "/api/profile/autoup", { enabled });
        const responseData = await res.json();
        console.log('Autoup update response:', responseData);
        return responseData;
      } catch (error) {
        console.error('Autoup update error:', error);
        throw error;
      }
    },
    onSuccess: (updatedProfile) => {
      console.log('Autoup preference updated successfully:', updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Auto-up preference updated",
        description: `Auto-up is now ${updatedProfile.autoup ? 'enabled' : 'disabled'}.`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error('Autoup update mutation error:', error);
      toast({
        title: "Update failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: any) => {
    updateProfileMutation.mutate(data);
  };

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>My Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex flex-col gap-4 items-center p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                <p className="text-sm text-muted-foreground">Loading profile data...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col gap-4 items-center p-8 text-center">
                <p className="text-destructive font-medium">Error loading profile</p>
                <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try refreshing the page."}</p>
                <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                  Refresh Page
                </Button>
              </div>
            ) : (
              <>
                {/* Username (non-editable) */}
                <div className="space-y-1">
                  <p className="text-sm font-medium">Username</p>
                  <p className="text-base font-semibold">{user.username}</p>
                </div>

                {/* Auto-up Preference */}
                <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium">Auto-up Preference</h3>
                    <p className="text-sm text-muted-foreground">
                      When enabled, you'll automatically be added to the queue after your game.
                    </p>
                  </div>
                  <Switch
                    checked={profile?.autoup || false}
                    onCheckedChange={(checked) => toggleAutoupMutation.mutate(checked)}
                    disabled={toggleAutoupMutation.isPending}
                    className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input border-2 border-muted-foreground"
                  />
                </div>

                {/* Profile Form */}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input type="tel" {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="birthYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Year</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="birthMonth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Month</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1-12"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value ? parseInt(e.target.value) : undefined;
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="birthDay"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Day</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1-31"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value ? parseInt(e.target.value) : undefined;
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSubmitting || updateProfileMutation.isPending}
                    >
                      {isSubmitting || updateProfileMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></span>
                          Saving...
                        </span>
                      ) : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}