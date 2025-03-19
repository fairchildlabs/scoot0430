import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, insertGameSetSchema, type InsertGameSet } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Redirect } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as z from 'zod';
import { CaretSortIcon, ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";

// Add after TabsTrigger imports:
const pointSystemOptions = ['1s only', '2s only', '2s and 3s'] as const;
const gymOptions = ['fonde'] as const;
const courtOptions = ['East', 'West'] as const;


type SortDirection = "asc" | "desc";
type SortConfig = {
 key: string;
 direction: SortDirection;
};

function useSortableData(items: any[], config: SortConfig | null = null) {
 const [sortConfig, setSortConfig] = useState<SortConfig | null>(config);

 const sortedItems = useMemo(() => {
   if (!items || !sortConfig) return items;

   return [...items].sort((a, b) => {
     const aValue = (a[sortConfig.key] || '').toString().toLowerCase();
     const bValue = (b[sortConfig.key] || '').toString().toLowerCase();

     if (aValue < bValue) {
       return sortConfig.direction === 'asc' ? -1 : 1;
     }
     if (aValue > bValue) {
       return sortConfig.direction === 'asc' ? 1 : -1;
     }
     return 0;
   });
 }, [items, sortConfig]);

 const requestSort = (key: string) => {
   let direction: SortDirection = 'asc';
   if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
     direction = 'desc';
   }
   setSortConfig({ key, direction });
 };

 return { items: sortedItems, requestSort, sortConfig };
}

function EditUserDialog({ user, open, onClose }: { user: any; open: boolean; onClose: () => void }) {
 const { toast } = useToast();
 const editForm = useForm({
   resolver: zodResolver(
     insertUserSchema
       .partial()
       .omit({ password: true })
   ),
   defaultValues: {
     username: user.username,
     firstName: user.firstName || "",
     lastName: user.lastName || "",
     email: user.email || "",
     phone: user.phone || "",
     birthYear: user.birthYear,
     birthMonth: user.birthMonth || null,
     birthDay: user.birthDay || null,
     isPlayer: user.isPlayer,
     isBank: user.isBank,
     isBook: user.isBook,
     isEngineer: user.isEngineer,
     isRoot: user.isRoot,
   },
 });

 const editMutation = useMutation({
   mutationFn: async (data: any) => {
     const res = await apiRequest("PATCH", `/api/users/${user.id}`, data);
     return res.json();
   },
   onSuccess: () => {
     queryClient.invalidateQueries({ queryKey: ["/api/users"] });
     onClose();
   },
   onError: (error: Error) => {
     toast({
       title: "Update failed",
       description: error.message,
       variant: "destructive",
     });
   },
 });

 return (
   <Dialog open={open} onOpenChange={onClose}>
     <DialogContent>
       <DialogHeader>
         <DialogTitle>Edit User: {user.username}</DialogTitle>
       </DialogHeader>
       <Form {...editForm}>
         <form onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))} className="space-y-4">
           <FormField
             control={editForm.control}
             name="username"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Username</FormLabel>
                 <FormControl>
                   <Input {...field} />
                 </FormControl>
               </FormItem>
             )}
           />
           <FormField
             control={editForm.control}
             name="email"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Email (Optional)</FormLabel>
                 <FormControl>
                   <Input type="email" {...field} value={field.value || ""} />
                 </FormControl>
               </FormItem>
             )}
           />
           <FormField
             control={editForm.control}
             name="phone"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Phone (Optional)</FormLabel>
                 <FormControl>
                   <Input type="tel" {...field} value={field.value || ""} />
                 </FormControl>
               </FormItem>
             )}
           />
           <FormField
             control={editForm.control}
             name="firstName"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>First Name (Optional)</FormLabel>
                 <FormControl>
                   <Input {...field} value={field.value || ""} />
                 </FormControl>
               </FormItem>
             )}
           />
           <FormField
             control={editForm.control}
             name="lastName"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Last Name (Optional)</FormLabel>
                 <FormControl>
                   <Input {...field} value={field.value || ""} />
                 </FormControl>
               </FormItem>
             )}
           />
           <div className="grid grid-cols-3 gap-4">
             <FormField
               control={editForm.control}
               name="birthYear"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Birth Year*</FormLabel>
                   <FormControl>
                     <Input
                       type="number"
                       {...field}
                       onChange={e => field.onChange(parseInt(e.target.value))}
                     />
                   </FormControl>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="birthMonth"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Month</FormLabel>
                   <FormControl>
                     <Input
                       type="number"
                       placeholder="1-12"
                       {...field}
                       value={field.value || ""}
                       onChange={e => {
                         const value = e.target.value ? parseInt(e.target.value) : undefined;
                         field.onChange(value);
                       }}
                     />
                   </FormControl>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="birthDay"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Day</FormLabel>
                   <FormControl>
                     <Input
                       type="number"
                       placeholder="1-31"
                       {...field}
                       value={field.value || ""}
                       onChange={e => {
                         const value = e.target.value ? parseInt(e.target.value) : undefined;
                         field.onChange(value);
                       }}
                     />
                   </FormControl>
                 </FormItem>
               )}
             />
           </div>
           <div className="space-y-4">
             <FormLabel>Permissions</FormLabel>
             <FormDescription>Select one or more permissions</FormDescription>
             <FormField
               control={editForm.control}
               name="isPlayer"
               render={({ field }) => (
                 <FormItem className="flex items-center space-x-2">
                   <FormControl>
                     <Checkbox
                       checked={field.value}
                       onCheckedChange={field.onChange}
                     />
                   </FormControl>
                   <FormLabel className="!mt-0">Player</FormLabel>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="isBank"
               render={({ field }) => (
                 <FormItem className="flex items-center space-x-2">
                   <FormControl>
                     <Checkbox
                       checked={field.value}
                       onCheckedChange={field.onChange}
                     />
                   </FormControl>
                   <FormLabel className="!mt-0">Bank</FormLabel>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="isBook"
               render={({ field }) => (
                 <FormItem className="flex items-center space-x-2">
                   <FormControl>
                     <Checkbox
                       checked={field.value}
                       onCheckedChange={field.onChange}
                     />
                   </FormControl>
                   <FormLabel className="!mt-0">Book</FormLabel>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="isEngineer"
               render={({ field }) => (
                 <FormItem className="flex items-center space-x-2">
                   <FormControl>
                     <Checkbox
                       checked={field.value}
                       onCheckedChange={field.onChange}
                     />
                   </FormControl>
                   <FormLabel className="!mt-0">Engineer</FormLabel>
                 </FormItem>
               )}
             />
             <FormField
               control={editForm.control}
               name="isRoot"
               render={({ field }) => (
                 <FormItem className="flex items-center space-x-2">
                   <FormControl>
                     <Checkbox
                       checked={field.value}
                       onCheckedChange={field.onChange}
                     />
                   </FormControl>
                   <FormLabel className="!mt-0">Root</FormLabel>
                 </FormItem>
               )}
             />
           </div>
           <Button type="submit" className="w-full" disabled={editMutation.isPending}>
             Save Changes
           </Button>
         </form>
       </Form>
     </DialogContent>
   </Dialog>
 );
}

export default function UserManagementPage() {
 const { user, registerMutation } = useAuth();
 const { toast } = useToast();
 const [lastCreatedPlayer, setLastCreatedPlayer] = useState<string | null>(null);
 const [editingUser, setEditingUser] = useState<any>(null);
 const [searchQuery, setSearchQuery] = useState("");

 // Form setup must come before any usage
 const registerForm = useForm({
   resolver: zodResolver(insertUserSchema),
   defaultValues: {
     username: "",
     password: "",
     firstName: "",
     lastName: "",
     email: "",
     phone: "",
     birthYear: new Date().getFullYear(),
     birthMonth: undefined,
     birthDay: undefined,
     isPlayer: true,
     isBank: false,
     isBook: false,
     isEngineer: false,
     isRoot: false,
   },
 });

 // Query hooks
 const { data: players = [] } = useQuery({
   queryKey: ["/api/users"],
   enabled: !!user?.isEngineer || !!user?.isRoot,
 });

 const { data: checkins = [] } = useQuery({
   queryKey: ["/api/checkins"],
   enabled: !!user?.isEngineer || !!user?.isRoot,
 });

 // Memoized values
 const checkedInUserIds = useMemo(() => {
   return new Set((checkins || []).map((checkin: any) => checkin.userId));
 }, [checkins]);

 const { items: sortedPlayers, requestSort, sortConfig } = useSortableData(players);

 const filteredPlayers = useMemo(() => {
   if (!searchQuery.trim()) return sortedPlayers;

   const query = searchQuery.toLowerCase();
   return sortedPlayers.filter((player: any) => {
     return (
       player.username.toLowerCase().includes(query) ||
       (player.firstName?.toLowerCase() || '').includes(query) ||
       (player.lastName?.toLowerCase() || '').includes(query)
     );
   });
 }, [sortedPlayers, searchQuery]);

 // Mutations
 const checkinMutation = useMutation({
   mutationFn: async (userId: number) => {
     const res = await apiRequest("POST", "/api/checkins", { userId });
     return res.json();
   },
   onSuccess: () => {
     queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
   },
   onError: (error: Error) => {
     toast({
       title: "Check-in failed",
       description: error.message,
       variant: "destructive",
     });
   },
 });

 // Event handlers
 const onSubmit = async (data: any) => {
   try {
     const result = await registerMutation.mutateAsync(data);
     setLastCreatedPlayer(result.username);
     registerForm.reset();
     queryClient.invalidateQueries({ queryKey: ["/api/users"] });
   } catch (error) {
     console.error('Failed to create player:', error);
   }
 };

 // Early return for unauthorized access
 if (!user?.isEngineer && !user?.isRoot) {
   return <Redirect to="/" />;
 }

 // Component fragments
 const createFormFields = (
   <>
     <FormField
       control={registerForm.control}
       name="email"
       render={({ field }) => (
         <FormItem>
           <FormLabel>Email (Optional)</FormLabel>
           <FormControl>
             <Input type="email" {...field} value={field.value || ""} />
           </FormControl>
         </FormItem>
       )}
     />
     <FormField
       control={registerForm.control}
       name="phone"
       render={({ field }) => (
         <FormItem>
           <FormLabel>Phone (Optional)</FormLabel>
           <FormControl>
             <Input type="tel" {...field} value={field.value || ""} />
           </FormControl>
         </FormItem>
       )}
     />
   </>
 );

 function NewGameSetForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lastCreatedSetId, setLastCreatedSetId] = useState<number | null>(null);

  const form = useForm<InsertGameSet>({
    resolver: zodResolver(insertGameSetSchema),
    defaultValues: {
      playersPerTeam: 4,
      gym: 'fonde' as const,
      maxConsecutiveTeamWins: 2,
      timeLimit: 15,
      winScore: 21,
      pointSystem: '2s and 3s' as const,
      numberOfCourts: 2,
    },
  });

  const createGameSetMutation = useMutation({
    mutationFn: async (data: InsertGameSet) => {
      console.log('Mutation starting with data:', data);
      const res = await apiRequest("POST", "/api/game-sets", data);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      return await res.json();
    },
    onSuccess: (gameSet: any) => {
      console.log('Game set created successfully:', gameSet);
      queryClient.invalidateQueries({ queryKey: ["/api/game-sets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game-sets/active"] });
      setLastCreatedSetId(gameSet.id);
      toast({
        title: "Success",
        description: `Game Set #${gameSet.id} created successfully`,
      });
      form.reset();
    },
    onError: (error: Error) => {
      console.error('Game set creation failed:', error);
      toast({
        title: "Failed to create game set",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (formData: InsertGameSet) => {
    console.log('Form submitted with data:', formData);
    try {
      await createGameSetMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  return (
    <div className="space-y-6">
      {lastCreatedSetId && (
        <div className="p-4 bg-primary/10 rounded-lg">
          <p className="text-lg font-semibold">Last Created: Game Set #{lastCreatedSetId}</p>
        </div>
      )}
      {Object.keys(form.formState.errors).length > 0 && (
        <div className="p-4 bg-destructive/10 rounded-lg">
          <p className="text-sm text-destructive">Please fix the form errors and try again.</p>
          <pre className="mt-2 text-xs">
            {JSON.stringify(form.formState.errors, null, 2)}
          </pre>
        </div>
      )}
      <Form {...form}>
        <form 
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="playersPerTeam"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Players Per Team</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numberOfCourts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Courts</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gym"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gym</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="w-full p-2 rounded-md border border-input bg-background"
                  >
                    {gymOptions.map(gym => (
                      <option key={gym} value={gym}>{gym}</option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxConsecutiveTeamWins"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Consecutive Team Wins</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="timeLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time Limit (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="winScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Win Score</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pointSystem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Point System</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="w-full p-2 rounded-md border border-input bg-background"
                  >
                    {pointSystemOptions.map(system => (
                      <option key={system} value={system}>{system}</option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={createGameSetMutation.isPending}
          >
            {createGameSetMutation.isPending ? "Creating..." : "Create Game Set"}
          </Button>
        </form>
      </Form>
    </div>
  );
}


 return (
   <div className="min-h-screen bg-black">
     <Header />
     <main className="container mx-auto px-4 py-8">
       <Card>
         <CardHeader>
           <div className="space-y-2">
             <CardTitle>Player Management</CardTitle>
             {lastCreatedPlayer && (
               <p className="text-sm text-muted-foreground">
                 Player created: {lastCreatedPlayer}
               </p>
             )}
           </div>
         </CardHeader>
         <CardContent>
           <Tabs defaultValue="roster" className="space-y-4">
             <TabsList>
               <TabsTrigger value="roster">Today's Roster</TabsTrigger>
               <TabsTrigger value="list">Player List</TabsTrigger>
               <TabsTrigger value="create">Create New Player</TabsTrigger>
               <TabsTrigger value="game-set">New Game Set</TabsTrigger>
             </TabsList>

             <TabsContent value="roster">
               <div className="rounded-md border">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>Queue Position</TableHead>
                       <TableHead>Username</TableHead>
                       <TableHead>Check-in Time</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {checkins?.map((checkin: any, index: number) => (
                       <TableRow key={checkin.id}>
                         <TableCell>{index + 1}</TableCell>
                         <TableCell>{checkin.username}</TableCell>
                         <TableCell>
                           {format(new Date(checkin.checkInTime), 'h:mm a')}
                         </TableCell>
                       </TableRow>
                     ))}
                     {(!checkins || checkins.length === 0) && (
                       <TableRow>
                         <TableCell colSpan={3} className="text-center text-muted-foreground">
                           No players checked in
                         </TableCell>
                       </TableRow>
                     )}
                   </TableBody>
                 </Table>
               </div>
             </TabsContent>

             <TabsContent value="list">
               <div className="space-y-4">
                 <Input
                   placeholder="Search by username, first name, or last name..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="max-w-sm"
                 />
                 <div className="rounded-md border">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead onClick={() => requestSort('username')} className="cursor-pointer">
                           <div className="flex items-center">
                             Username
                             {sortConfig?.key === 'username' && (
                               sortConfig.direction === 'asc' ? <ChevronUpIcon className="ml-1" /> : <ChevronDownIcon className="ml-1" />
                             )}
                             {!sortConfig?.key && <CaretSortIcon className="ml-1" />}
                           </div>
                         </TableHead>
                         <TableHead onClick={() => requestSort('firstName')} className="cursor-pointer">
                           <div className="flex items-center">
                             First Name
                             {sortConfig?.key === 'firstName' && (
                               sortConfig.direction === 'asc' ? <ChevronUpIcon className="ml-1" /> : <ChevronDownIcon className="ml-1" />
                             )}
                             {!sortConfig?.key && <CaretSortIcon className="ml-1" />}
                           </div>
                         </TableHead>
                         <TableHead onClick={() => requestSort('lastName')} className="cursor-pointer">
                           <div className="flex items-center">
                             Last Name
                             {sortConfig?.key === 'lastName' && (
                               sortConfig.direction === 'asc' ? <ChevronUpIcon className="ml-1" /> : <ChevronDownIcon className="ml-1" />
                             )}
                             {!sortConfig?.key && <CaretSortIcon className="ml-1" />}
                           </div>
                         </TableHead>
                         <TableHead onClick={() => requestSort('birthYear')} className="cursor-pointer">
                           <div className="flex items-center">
                             Birth Year
                             {sortConfig?.key === 'birthYear' && (
                               sortConfig.direction === 'asc' ? <ChevronUpIcon className="ml-1" /> : <ChevronDownIcon className="ml-1" />
                             )}
                             {!sortConfig?.key && <CaretSortIcon className="ml-1" />}
                           </div>
                         </TableHead>
                         <TableHead>Actions</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {filteredPlayers?.map((player: any) => (
                         <TableRow key={player.id}>
                           <TableCell>{player.username}</TableCell>
                           <TableCell>{player.firstName || '-'}</TableCell>
                           <TableCell>{player.lastName || '-'}</TableCell>
                           <TableCell>{player.birthYear}</TableCell>
                           <TableCell>
                             <div className="flex gap-2">
                               <Button
                                 variant={checkedInUserIds.has(player.id) ? "secondary" : "outline"}
                                 size="sm"
                                 onClick={() => checkinMutation.mutate(player.id)}
                                 disabled={checkinMutation.isPending}
                                 className={checkedInUserIds.has(player.id) ? "bg-white hover:bg-white/90 text-black" : ""}
                               >
                                 {checkedInUserIds.has(player.id) ? "Check Out" : "Check In"}
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => setEditingUser(player)}
                               >
                                 Edit
                               </Button>
                             </div>
                           </TableCell>
                         </TableRow>
                       ))}
                       {(!filteredPlayers || filteredPlayers.length === 0) && (
                         <TableRow>
                           <TableCell colSpan={5} className="text-center text-muted-foreground">
                             No players found
                           </TableCell>
                         </TableRow>
                       )}
                     </TableBody>
                   </Table>
                 </div>
               </div>
             </TabsContent>

             <TabsContent value="create">
               <Form {...registerForm}>
                 <form onSubmit={registerForm.handleSubmit(onSubmit)} className="space-y-4">
                   <FormField
                     control={registerForm.control}
                     name="username"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Username</FormLabel>
                         <FormControl>
                           <Input {...field} />
                         </FormControl>
                       </FormItem>
                     )}
                   />
                   <FormField
                     control={registerForm.control}
                     name="password"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Password</FormLabel>
                         <FormControl>
                           <Input type="password" {...field} />
                         </FormControl>
                       </FormItem>
                     )}
                   />
                   {createFormFields}
                   <div className="space-y-4">
                     <FormField
                       control={registerForm.control}
                       name="firstName"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>First Name (Optional)</FormLabel>
                           <FormControl>
                             <Input {...field} value={field.value || ""} />
                           </FormControl>
                         </FormItem>
                       )}
                     />
                     <FormField
                       control={registerForm.control}
                       name="lastName"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Last Name (Optional)</FormLabel>
                           <FormControl>
                             <Input {...field} value={field.value || ""} />
                           </FormControl>
                         </FormItem>
                       )}
                     />
                     <div className="grid grid-cols-3 gap-4">
                       <FormField
                         control={registerForm.control}
                         name="birthYear"
                         render={({ field }) => (
                           <FormItem>
                             <FormLabel>Birth Year*</FormLabel>
                             <FormControl>
                               <Input
                                 type="number"
                                 {...field}
                                 onChange={e => field.onChange(parseInt(e.target.value))}
                               />
                             </FormControl>
                           </FormItem>
                         )}
                       />
                       <FormField
                         control={registerForm.control}
                         name="birthMonth"
                         render={({ field }) => (
                           <FormItem>
                             <FormLabel>Month</FormLabel>
                             <FormControl>
                               <Input
                                 type="number"
                                 placeholder="1-12"
                                 {...field}
                                 value={field.value || ""}
                                 onChange={e => {
                                   const value = e.target.value ? parseInt(e.target.value) : undefined;
                                   field.onChange(value);
                                 }}
                               />
                             </FormControl>
                           </FormItem>
                         )}
                       />
                       <FormField
                         control={registerForm.control}
                         name="birthDay"
                         render={({ field }) => (
                           <FormItem>
                             <FormLabel>Day</FormLabel>
                             <FormControl>
                               <Input
                                 type="number"
                                 placeholder="1-31"
                                 {...field}
                                 value={field.value || ""}
                                 onChange={e => {
                                   const value = e.target.value ? parseInt(e.target.value) : undefined;
                                   field.onChange(value);
                                 }}
                               />
                             </FormControl>
                           </FormItem>
                         )}
                       />
                     </div>
                   </div>
                   <div className="space-y-4">
                     <FormLabel>Permissions</FormLabel>
                     <FormDescription>Select one or more permissions</FormDescription>
                     <FormField
                       control={registerForm.control}
                       name="isPlayer"
                       render={({ field }) => (
                         <FormItem className="flex items-center space-x-2">
                           <FormControl>
                             <Checkbox
                               checked={field.value}
                               onCheckedChange={field.onChange}
                             />
                           </FormControl>
                           <FormLabel className="!mt-0">Player</FormLabel>
                         </FormItem>
                       )}
                     />
                     <FormField
                       control={registerForm.control}
                       name="isBank"
                       render={({ field }) => (
                         <FormItem className="flex items-center space-x-2">
                           <FormControl>
                             <Checkbox
                               checked={field.value}
                               onCheckedChange={field.onChange}
                             />
                           </FormControl>
                           <FormLabel className="!mt-0">Bank</FormLabel>
                         </FormItem>
                       )}
                     />
                     <FormField
                       control={registerForm.control}
                       name="isBook"
                       render={({ field }) => (
                         <FormItem className="flex items-center space-x-2">
                           <FormControl>
                             <Checkbox
                               checked={field.value}
                               onCheckedChange={field.onChange}
                             />
                           </FormControl>
                           <FormLabel className="!mt-0">Book</FormLabel>
                         </FormItem>
                       )}
                     />
                     <FormField
                       control={registerForm.control}
                       name="isEngineer"
                       render={({ field }) => (
                         <FormItem className="flex items-center space-x-2">
                           <FormControl>
                             <Checkbox
                               checked={field.value}
                               onCheckedChange={field.onChange}
                             />
                           </FormControl>
                           <FormLabel className="!mt-0">Engineer</FormLabel>
                         </FormItem>
                       )}
                     />
                     <FormField
                       control={registerForm.control}
                       name="isRoot"
                       render={({ field }) => (
                         <FormItem className="flex items-center space-x-2">
                           <FormControl>
                             <Checkbox
                               checked={field.value}
                               onCheckedChange={field.onChange}
                             />
                           </FormControl>
                           <FormLabel className="!mt-0">Root</FormLabel>
                         </FormItem>
                       )}
                     />
                   </div>
                   <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                     Create Player
                   </Button>
                 </form>
               </Form>
             </TabsContent>
             <TabsContent value="game-set">
               <NewGameSetForm />
             </TabsContent>
           </Tabs>
         </CardContent>
       </Card>
     </main>
     <Footer />
     {editingUser && (
       <EditUserDialog
         user={editingUser}
         open={true}
         onClose={() => setEditingUser(null)}
       />
     )}
   </div>
 );
}

interface GameSet {
    id: number;
    // ... other properties
}