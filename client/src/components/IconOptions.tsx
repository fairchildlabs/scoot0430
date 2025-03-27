import { 
  ArrowDownToLine, 
  ArrowDown, 
  ArrowDownNarrowWide, 
  ArrowDownFromLine,
  CircleArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function IconOptions() {
  return (
    <div className="p-4 bg-white rounded-md shadow">
      <h2 className="text-lg font-semibold mb-4">Available "Bottom" Icons</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center p-4 border rounded">
          <Button 
            size="icon" 
            variant="outline"
            className="rounded-full h-7 w-7 bg-black border-gray-800"
          >
            <ArrowDownToLine className="h-4 w-4 text-white" />
          </Button>
          <p className="mt-2 text-sm">ArrowDownToLine</p>
        </div>
        
        <div className="flex flex-col items-center p-4 border rounded">
          <Button 
            size="icon" 
            variant="outline"
            className="rounded-full h-7 w-7 bg-black border-gray-800"
          >
            <ArrowDown className="h-4 w-4 text-white" />
          </Button>
          <p className="mt-2 text-sm">ArrowDown</p>
        </div>
        
        <div className="flex flex-col items-center p-4 border rounded">
          <Button 
            size="icon" 
            variant="outline"
            className="rounded-full h-7 w-7 bg-black border-gray-800"
          >
            <ArrowDownNarrowWide className="h-4 w-4 text-white" />
          </Button>
          <p className="mt-2 text-sm">ArrowDownNarrowWide</p>
        </div>
        
        <div className="flex flex-col items-center p-4 border rounded">
          <Button 
            size="icon" 
            variant="outline"
            className="rounded-full h-7 w-7 bg-black border-gray-800"
          >
            <ArrowDownFromLine className="h-4 w-4 text-white" />
          </Button>
          <p className="mt-2 text-sm">ArrowDownFromLine</p>
        </div>

        <div className="flex flex-col items-center p-4 border rounded">
          <Button 
            size="icon" 
            variant="outline"
            className="rounded-full h-7 w-7 bg-black border-gray-800"
          >
            <CircleArrowDown className="h-4 w-4 text-white" />
          </Button>
          <p className="mt-2 text-sm">CircleArrowDown</p>
        </div>
      </div>
    </div>
  );
}