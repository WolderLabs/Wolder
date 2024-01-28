using DeGA.Core;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generators.CSharp.OpenAI
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddCSharpGeneration(this DeGAServiceBuilder builder)
        {
            builder.Services.AddTransient<CodeGeneratorFactory>();
            builder.Services.AddTransient<DotNetProjectGenerator>();
            return builder;
        }
    }
}
