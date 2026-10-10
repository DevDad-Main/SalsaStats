using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using NvAPIWrapper;
using NvAPIWrapper.GPU;

// Prints one JSON line per second with NVAPI readings; each metric is null when unavailable.
internal static class NvapiHelper
{
    private static string Num(double? value)
    {
        return value.HasValue && !double.IsNaN(value.Value) && !double.IsInfinity(value.Value)
            ? value.Value.ToString("0.##", CultureInfo.InvariantCulture)
            : "null";
    }

    private static string Str(string value)
    {
        if (value == null) return "null";
        var builder = new StringBuilder("\"");
        foreach (var c in value)
        {
            if (c == '"' || c == '\\') builder.Append('\\').Append(c);
            else if (c < 32) builder.Append(' ');
            else builder.Append(c);
        }
        return builder.Append('"').ToString();
    }

    private static double? Try(Func<double?> read)
    {
        try { return read(); } catch (Exception) { return null; }
    }

    private static string Describe(PhysicalGPU gpu)
    {
        var name = (string)null;
        try { name = gpu.FullName; } catch (Exception) { }

        var temperature = Try(() => gpu.ThermalInformation.ThermalSensors.Select(s => (double?)s.CurrentTemperature).FirstOrDefault());
        var usage = Try(() => gpu.UsageInformation.GPU.Percentage);
        var clock = Try(() => gpu.CurrentClockFrequencies.GraphicsClock.Frequency / 1000.0);
        var memoryClock = Try(() => gpu.CurrentClockFrequencies.MemoryClock.Frequency / 1000.0);
        var memoryTotal = Try(() => gpu.MemoryInformation.DedicatedVideoMemoryInkB / 1024.0);
        var memoryFree = Try(() => gpu.MemoryInformation.CurrentAvailableDedicatedVideoMemoryInkB / 1024.0);
        var memoryUsed = memoryTotal.HasValue && memoryFree.HasValue ? memoryTotal - memoryFree : null;
        var powerPercent = Try(() => gpu.PowerTopologyInformation.PowerTopologyEntries.Select(e => (double?)(e.PowerUsageInPCM / 1000.0)).FirstOrDefault());

        return "{\"name\":" + Str(name)
            + ",\"temperature\":" + Num(temperature)
            + ",\"utilization\":" + Num(usage)
            + ",\"clockGraphics\":" + Num(clock)
            + ",\"clockMemory\":" + Num(memoryClock)
            + ",\"memoryUsed\":" + Num(memoryUsed)
            + ",\"memoryTotal\":" + Num(memoryTotal)
            + ",\"powerPercent\":" + Num(powerPercent) + "}";
    }

    private static int Main()
    {
        try
        {
            NVIDIA.Initialize();
        }
        catch (Exception error)
        {
            Console.WriteLine("{\"error\":" + Str(error.Message) + "}");
            return 2;
        }

        while (true)
        {
            try
            {
                var gpus = PhysicalGPU.GetPhysicalGPUs();
                Console.WriteLine("{\"gpus\":[" + string.Join(",", gpus.Select(Describe)) + "]}");
            }
            catch (Exception error)
            {
                Console.WriteLine("{\"error\":" + Str(error.Message) + "}");
            }
            Console.Out.Flush();
            Thread.Sleep(1000);
        }
    }
}
