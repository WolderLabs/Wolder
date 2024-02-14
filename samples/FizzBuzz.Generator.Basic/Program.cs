using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.Core.Workspace;
using Wolder.CSharp;
using Wolder.CSharp.Actions;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

builder.Services.AddWolder(builder.Configuration.GetSection("Wolder"));

var host = builder.Build();

await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
    .AddCommandLineActions()
    .AddCSharpActions()
    .InvokeAsync<CreateFizzBuzz>("FizzBuzz.Basic.Output");

class CreateFizzBuzz(
    CommandLineActions commandLineActions,
    CSharpActions cSharpActions) : IVoidAction
{
    public async Task InvokeAsync()
    {
        await cSharpActions.CreateSdkGlobalAsync(
            new CreateSdkGlobalParameters(DotNetSdkVersion.Net8));
        
        var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");
        
        await commandLineActions.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                $"dotnet new console -n {mainProject.Name}"));

        await cSharpActions.CreateClassAsync(
            new CreateClassParameters(
                mainProject, 
                "Program",
                """
                for (int i = 1; i <= 100; i++)
                {
                    if (i % 3 == 0 && i % 5 == 0)
                    {
                        Console.WriteLine("FizzBuzz");
                    }
                    else if (i % 3 == 0)
                    {
                        Console.WriteLine("Fizz");
                    }
                    else if (i % 5 == 0)
                    {
                        Console.WriteLine("Buzz");
                    }
                    else
                    {
                        Console.WriteLine(i);
                    }
                }
                """));
        await cSharpActions.CompileProjectAsync(new CompileProjectParameters(mainProject));
        
        await commandLineActions.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                "dotnet run", mainProject.RelativeRoot, Interactive: true));
    }
}